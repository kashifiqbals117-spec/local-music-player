/**
 * Frontend User Library Service for SyncBeat Online Mode.
 * Handles Liked Songs, Playlists, Recently Played, and cross-device sync.
 * Provides instant optimistic UI updates cached in localStorage
 * while synchronizing with the backend REST API.
 */

import api from "./api";

const USER_ID_KEY = "syncbeat_user_id";
const CACHE_KEY = "syncbeat_cached_library";

function getUserId() {
  if (typeof window === "undefined") return "usr_default";
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

function getCachedLibrary() {
  if (typeof window === "undefined") {
    return { likedTracks: [], playlists: [], recentlyPlayed: [], syncKey: "" };
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn("Could not read cached user library:", err);
  }
  return {
    likedTracks: [],
    playlists: [
      {
        id: "pl_favorites",
        name: "Favorites",
        description: "Your favorite online music tracks",
        tracks: [],
      },
    ],
    recentlyPlayed: [],
    syncKey: "",
  };
}

function setCachedLibrary(data) {
  if (typeof window === "undefined" || !data) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Could not save user library cache:", err);
  }
}

class UserLibraryClient {
  constructor() {
    this.userId = getUserId();
    this.subscribers = new Set();
    this.library = getCachedLibrary();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    setCachedLibrary(this.library);
    for (const sub of this.subscribers) {
      try {
        sub(this.library);
      } catch (err) {
        console.error("Library subscriber error:", err);
      }
    }
  }

  getSnapshot() {
    return this.library;
  }

  getUserId() {
    return this.userId;
  }

  getSyncKey() {
    return this.library.syncKey || "";
  }

  isLiked(trackId) {
    if (!trackId) return false;
    return this.library.likedTracks.some((t) => (t.id || t.streamUrl) === trackId);
  }

  async fetchLibrary() {
    try {
      const baseUrl = api.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/user`, {
        headers: { "x-user-id": this.userId },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.library) {
          this.library = data.library;
          this.notify();
          return this.library;
        }
      }
    } catch (err) {
      console.warn("Could not sync user library with backend (offline mode):", err.message);
    }
    return this.library;
  }

  async toggleLike(track) {
    if (!track) return false;
    const trackId = track.id || track.streamUrl;
    const existingIndex = this.library.likedTracks.findIndex(
      (t) => (t.id || t.streamUrl) === trackId
    );

    let isLiked = false;
    // Optimistic local update
    if (existingIndex >= 0) {
      this.library.likedTracks.splice(existingIndex, 1);
      isLiked = false;
    } else {
      this.library.likedTracks.unshift({
        id: track.id || trackId,
        title: track.title || track.name || "Untitled Track",
        artist: track.artist || "Unknown Artist",
        album: track.album || "",
        duration: Number(track.duration) || 0,
        artwork: track.artwork || null,
        streamUrl: track.streamUrl || (track.id ? `/api/music/stream/${track.id}` : null),
        source: track.source || "audius",
        likedAt: Date.now(),
      });
      isLiked = true;
    }
    this.notify();

    // Sync with backend
    try {
      const baseUrl = api.getBaseUrl();
      await fetch(`${baseUrl}/api/user/liked`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": this.userId,
        },
        body: JSON.stringify({ track }),
      });
    } catch (err) {
      console.warn("Failed to sync liked track with backend:", err.message);
    }

    return isLiked;
  }

  async createPlaylist(name, description = "") {
    const cleanName = (name || "").trim() || "New Playlist";
    const newPlaylist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: cleanName,
      description: description.trim(),
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Optimistic local update
    this.library.playlists.push(newPlaylist);
    this.notify();

    // Sync with backend
    try {
      const baseUrl = api.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/user/playlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": this.userId,
        },
        body: JSON.stringify({ name: cleanName, description }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.playlist) {
          // Replace optimistic ID with server ID if different
          const idx = this.library.playlists.findIndex((p) => p.id === newPlaylist.id);
          if (idx >= 0) {
            this.library.playlists[idx] = data.playlist;
            this.notify();
          }
          return data.playlist;
        }
      }
    } catch (err) {
      console.warn("Failed to sync new playlist with backend:", err.message);
    }

    return newPlaylist;
  }

  async updatePlaylist(playlistId, updates = {}) {
    const pl = this.library.playlists.find((p) => p.id === playlistId);
    if (!pl) return null;

    if (updates.name !== undefined) pl.name = String(updates.name).trim() || pl.name;
    if (updates.description !== undefined) pl.description = String(updates.description);
    if (Array.isArray(updates.tracks)) pl.tracks = updates.tracks;
    pl.updatedAt = Date.now();
    this.notify();

    try {
      const baseUrl = api.getBaseUrl();
      await fetch(`${baseUrl}/api/user/playlists/${encodeURIComponent(playlistId)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": this.userId,
        },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.warn("Failed to sync playlist updates with backend:", err.message);
    }

    return pl;
  }

  async deletePlaylist(playlistId) {
    this.library.playlists = this.library.playlists.filter((p) => p.id !== playlistId);
    this.notify();

    try {
      const baseUrl = api.getBaseUrl();
      await fetch(`${baseUrl}/api/user/playlists/${encodeURIComponent(playlistId)}`, {
        method: "DELETE",
        headers: { "x-user-id": this.userId },
      });
    } catch (err) {
      console.warn("Failed to sync playlist deletion with backend:", err.message);
    }
  }

  async addTrackToPlaylist(playlistId, track) {
    if (!track) return false;
    const pl = this.library.playlists.find((p) => p.id === playlistId);
    if (!pl) return false;

    const trackId = track.id || track.streamUrl;
    if (pl.tracks.some((t) => (t.id || t.streamUrl) === trackId)) {
      return false; // already in playlist
    }

    pl.tracks.push({
      id: track.id || trackId,
      title: track.title || track.name || "Untitled Track",
      artist: track.artist || "Unknown Artist",
      album: track.album || "",
      duration: Number(track.duration) || 0,
      artwork: track.artwork || null,
      streamUrl: track.streamUrl || (track.id ? `/api/music/stream/${track.id}` : null),
      source: track.source || "audius",
      addedAt: Date.now(),
    });
    pl.updatedAt = Date.now();
    this.notify();

    try {
      const baseUrl = api.getBaseUrl();
      await fetch(
        `${baseUrl}/api/user/playlists/${encodeURIComponent(playlistId)}/tracks`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": this.userId,
          },
          body: JSON.stringify({ track }),
        }
      );
    } catch (err) {
      console.warn("Failed to sync track addition to playlist with backend:", err.message);
    }

    return true;
  }

  async removeTrackFromPlaylist(playlistId, trackId) {
    const pl = this.library.playlists.find((p) => p.id === playlistId);
    if (!pl) return false;

    pl.tracks = pl.tracks.filter((t) => (t.id || t.streamUrl) !== trackId);
    pl.updatedAt = Date.now();
    this.notify();

    try {
      const baseUrl = api.getBaseUrl();
      await fetch(
        `${baseUrl}/api/user/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`,
        {
          method: "DELETE",
          headers: { "x-user-id": this.userId },
        }
      );
    } catch (err) {
      console.warn("Failed to sync track removal from playlist with backend:", err.message);
    }

    return true;
  }

  recordHistory(track) {
    if (!track) return;
    const trackId = track.id || track.streamUrl;
    this.library.recentlyPlayed = this.library.recentlyPlayed.filter(
      (t) => (t.id || t.streamUrl) !== trackId
    );

    this.library.recentlyPlayed.unshift({
      id: track.id || trackId,
      title: track.title || track.name || "Untitled Track",
      artist: track.artist || "Unknown Artist",
      album: track.album || "",
      duration: Number(track.duration) || 0,
      artwork: track.artwork || null,
      streamUrl: track.streamUrl || (track.id ? `/api/music/stream/${track.id}` : null),
      source: track.source || "audius",
      playedAt: Date.now(),
    });

    if (this.library.recentlyPlayed.length > 50) {
      this.library.recentlyPlayed = this.library.recentlyPlayed.slice(0, 50);
    }
    this.notify();

    try {
      const baseUrl = api.getBaseUrl();
      fetch(`${baseUrl}/api/user/history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": this.userId,
        },
        body: JSON.stringify({ track }),
      }).catch(() => {});
    } catch {
      // ignore history background errors
    }
  }

  async syncWithKey(syncKey) {
    if (!syncKey) return { success: false, error: "Sync key is required." };
    try {
      const baseUrl = api.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/user/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": this.userId,
        },
        body: JSON.stringify({ syncKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || "Sync failed." };
      }
      this.library = data.library;
      this.notify();
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, error: err.message || "Network error during sync." };
    }
  }
}

export const userLibrary = new UserLibraryClient();
export default userLibrary;
