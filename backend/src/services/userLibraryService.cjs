/**
 * Persistent User Library Service for SyncBeat Online Mode.
 * Manages liked songs, playlists, recently played tracks, and preferences
 * with atomic file-backed storage and in-memory indexing.
 */

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

class UserLibraryService {
  constructor(storagePath) {
    this.storagePath =
      storagePath ||
      path.join(process.cwd(), "data", "user_libraries.json");
    this.libraries = new Map();
    this.syncKeyIndex = new Map(); // syncKey -> userId
    this.init();
  }

  init() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, "utf-8");
        const parsed = JSON.parse(raw);
        for (const [userId, lib] of Object.entries(parsed)) {
          this.libraries.set(userId, lib);
          if (lib.syncKey) {
            this.syncKeyIndex.set(lib.syncKey.toUpperCase(), userId);
          }
        }
      }
    } catch (err) {
      console.warn("[UserLibraryService] Could not read existing storage, starting fresh:", err.message);
    }
  }

  save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const obj = {};
      for (const [userId, lib] of this.libraries.entries()) {
        obj[userId] = lib;
      }

      const tempPath = `${this.storagePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(obj, null, 2), "utf-8");
      fs.renameSync(tempPath, this.storagePath);
    } catch (err) {
      console.error("[UserLibraryService] Failed to persist libraries:", err);
    }
  }

  generateSyncKey() {
    const chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    let key = "SB-";
    for (let i = 0; i < 6; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }

  getOrCreateUser(userId) {
    const cleanId = (userId || "").trim();
    if (!cleanId) return null;

    if (!this.libraries.has(cleanId)) {
      const syncKey = this.generateSyncKey();
      const newLib = {
        userId: cleanId,
        syncKey,
        likedTracks: [],
        playlists: [
          {
            id: "pl_favorites",
            name: "Favorites",
            description: "Your favorite online music tracks",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            tracks: [],
          },
        ],
        recentlyPlayed: [],
        preferences: {
          theme: "dark",
          volume: 0.8,
          lastMode: "online",
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.libraries.set(cleanId, newLib);
      this.syncKeyIndex.set(syncKey, cleanId);
      this.save();
    }

    return this.libraries.get(cleanId);
  }

  getLibrary(userId) {
    return this.getOrCreateUser(userId);
  }

  toggleLike(userId, track) {
    const lib = this.getOrCreateUser(userId);
    if (!lib || !track) return { success: false, error: "Invalid user or track." };

    const trackId = track.id || track.streamUrl;
    const existingIndex = lib.likedTracks.findIndex((t) => (t.id || t.streamUrl) === trackId);

    let isLiked = false;
    if (existingIndex >= 0) {
      lib.likedTracks.splice(existingIndex, 1);
      isLiked = false;
    } else {
      lib.likedTracks.unshift({
        id: track.id || randomUUID(),
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

    lib.updatedAt = Date.now();
    this.save();
    return { success: true, isLiked, likedTracks: lib.likedTracks };
  }

  createPlaylist(userId, { name, description = "" }) {
    const lib = this.getOrCreateUser(userId);
    if (!lib) return { success: false, error: "User not found." };

    const cleanName = (name || "").trim() || "New Playlist";
    const newPlaylist = {
      id: `pl_${Date.now()}_${randomUUID().slice(0, 6)}`,
      name: cleanName,
      description: description.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tracks: [],
    };

    lib.playlists.push(newPlaylist);
    lib.updatedAt = Date.now();
    this.save();
    return { success: true, playlist: newPlaylist, playlists: lib.playlists };
  }

  updatePlaylist(userId, playlistId, updates = {}) {
    const lib = this.getOrCreateUser(userId);
    if (!lib) return { success: false, error: "User not found." };

    const playlist = lib.playlists.find((p) => p.id === playlistId);
    if (!playlist) return { success: false, error: "Playlist not found." };

    if (updates.name !== undefined) playlist.name = String(updates.name).trim() || playlist.name;
    if (updates.description !== undefined) playlist.description = String(updates.description);
    if (Array.isArray(updates.tracks)) playlist.tracks = updates.tracks;

    playlist.updatedAt = Date.now();
    lib.updatedAt = Date.now();
    this.save();
    return { success: true, playlist, playlists: lib.playlists };
  }

  deletePlaylist(userId, playlistId) {
    const lib = this.getOrCreateUser(userId);
    if (!lib) return { success: false, error: "User not found." };

    lib.playlists = lib.playlists.filter((p) => p.id !== playlistId);
    lib.updatedAt = Date.now();
    this.save();
    return { success: true, playlists: lib.playlists };
  }

  addTrackToPlaylist(userId, playlistId, track) {
    const lib = this.getOrCreateUser(userId);
    if (!lib || !track) return { success: false, error: "Invalid parameters." };

    const playlist = lib.playlists.find((p) => p.id === playlistId);
    if (!playlist) return { success: false, error: "Playlist not found." };

    const trackId = track.id || track.streamUrl;
    const exists = playlist.tracks.some((t) => (t.id || t.streamUrl) === trackId);
    if (exists) {
      return { success: false, error: "Track already in playlist.", playlist };
    }

    playlist.tracks.push({
      id: track.id || randomUUID(),
      title: track.title || track.name || "Untitled Track",
      artist: track.artist || "Unknown Artist",
      album: track.album || "",
      duration: Number(track.duration) || 0,
      artwork: track.artwork || null,
      streamUrl: track.streamUrl || (track.id ? `/api/music/stream/${track.id}` : null),
      source: track.source || "audius",
      addedAt: Date.now(),
    });

    playlist.updatedAt = Date.now();
    lib.updatedAt = Date.now();
    this.save();
    return { success: true, playlist, playlists: lib.playlists };
  }

  removeTrackFromPlaylist(userId, playlistId, trackId) {
    const lib = this.getOrCreateUser(userId);
    if (!lib) return { success: false, error: "User not found." };

    const playlist = lib.playlists.find((p) => p.id === playlistId);
    if (!playlist) return { success: false, error: "Playlist not found." };

    playlist.tracks = playlist.tracks.filter((t) => (t.id || t.streamUrl) !== trackId);
    playlist.updatedAt = Date.now();
    lib.updatedAt = Date.now();
    this.save();
    return { success: true, playlist, playlists: lib.playlists };
  }

  recordHistory(userId, track) {
    const lib = this.getOrCreateUser(userId);
    if (!lib || !track) return { success: false };

    const trackId = track.id || track.streamUrl;
    // Remove if already exists to push to front
    lib.recentlyPlayed = lib.recentlyPlayed.filter((t) => (t.id || t.streamUrl) !== trackId);

    lib.recentlyPlayed.unshift({
      id: track.id || randomUUID(),
      title: track.title || track.name || "Untitled Track",
      artist: track.artist || "Unknown Artist",
      album: track.album || "",
      duration: Number(track.duration) || 0,
      artwork: track.artwork || null,
      streamUrl: track.streamUrl || (track.id ? `/api/music/stream/${track.id}` : null),
      source: track.source || "audius",
      playedAt: Date.now(),
    });

    // Cap at 50 tracks
    if (lib.recentlyPlayed.length > 50) {
      lib.recentlyPlayed = lib.recentlyPlayed.slice(0, 50);
    }

    lib.updatedAt = Date.now();
    this.save();
    return { success: true, recentlyPlayed: lib.recentlyPlayed };
  }

  syncWithKey(targetUserId, sourceSyncKey) {
    const cleanKey = (sourceSyncKey || "").trim().toUpperCase();
    const sourceUserId = this.syncKeyIndex.get(cleanKey);

    if (!sourceUserId || !this.libraries.has(sourceUserId)) {
      return { success: false, error: "Sync key not found. Check the code and try again." };
    }

    const sourceLib = this.libraries.get(sourceUserId);
    const targetLib = this.getOrCreateUser(targetUserId);

    // Merge liked songs (union without duplicates)
    const existingIds = new Set(targetLib.likedTracks.map((t) => t.id || t.streamUrl));
    for (const t of sourceLib.likedTracks) {
      if (!existingIds.has(t.id || t.streamUrl)) {
        targetLib.likedTracks.push(t);
        existingIds.add(t.id || t.streamUrl);
      }
    }

    // Merge playlists
    const existingPlaylistNames = new Set(targetLib.playlists.map((p) => p.name.toLowerCase()));
    for (const p of sourceLib.playlists) {
      if (!existingPlaylistNames.has(p.name.toLowerCase())) {
        targetLib.playlists.push({ ...p, id: `pl_sync_${Date.now()}_${randomUUID().slice(0, 6)}` });
      }
    }

    targetLib.updatedAt = Date.now();
    this.save();

    return {
      success: true,
      library: targetLib,
      message: `Library merged successfully from device (${cleanKey})`,
    };
  }
}

module.exports = UserLibraryService;
