/**
 * Centralized HTTP API Client for SyncBeat.
 * Handles base URL resolution, headers, timeouts, and error handling.
 */

import musicService from "./musicService";

function getBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  // If explicitly configured via Vite environment variable
  if (import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, "");
  }

  // In Electron desktop environment, always use local loopback
  if (musicService.isElectron()) {
    return "http://localhost:3001";
  }

  // In web browsers (mobile, Mac on hotspot), connect via current origin
  return window.location.origin;
}

/**
 * Standard fetch wrapper with timeout and JSON handling.
 */
async function request(endpoint, options = {}) {
  const baseUrl = options.baseUrl || getBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const headers = { ...options.headers };

  // Set Content-Type: application/json if sending a JSON body (and not FormData)
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const timeoutMs = options.timeoutMs || 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Parse JSON if response is JSON, otherwise text
    const contentType = res.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const errorMessage =
        (typeof data === "object" && data?.error) ||
        (typeof data === "string" && data) ||
        `HTTP ${res.status}: ${res.statusText}`;
      const err = new Error(errorMessage);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms.`, { cause: err });
    }
    throw err;
  }
}

export const api = {
  getBaseUrl,

  /**
   * Check backend health status.
   */
  async checkHealth(baseUrl) {
    return await request("/health", { baseUrl });
  },

  /**
   * Create a new synchronized listening session.
   */
  async createSession({ hostName = "Host", sessionId = null, mode = "offline" } = {}, baseUrl) {
    return await request("/api/sessions", {
      method: "POST",
      baseUrl,
      body: JSON.stringify({ hostName, sessionId, mode }),
    });
  },

  /**
   * Fetch public state of an active session.
   */
  async getSession(sessionId, baseUrl) {
    return await request(`/api/sessions/${encodeURIComponent(sessionId)}`, { baseUrl });
  },

  /**
   * Generate QR Code data URL for joining session.
   */
  async getQrCode(sessionId, baseUrl) {
    return await request(`/api/sessions/${encodeURIComponent(sessionId)}/qr`, { baseUrl });
  },

  /**
   * Upload or link an audio track to a session (Host only).
   */
  async setTrack(sessionId, hostToken, payload, baseUrl) {
    const isFormData = payload instanceof FormData;
    return await request(`/api/sessions/${encodeURIComponent(sessionId)}/track`, {
      method: "POST",
      baseUrl,
      headers: {
        "x-host-token": hostToken,
      },
      body: isFormData ? payload : JSON.stringify(payload),
    });
  },

  /**
   * Host kicks a participant from the session.
   */
  async removeParticipant(sessionId, hostToken, participantId, baseUrl) {
    return await request(
      `/api/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}`,
      {
        method: "DELETE",
        baseUrl,
        headers: {
          "x-host-token": hostToken,
        },
      }
    );
  },

  /* ========================================================================
     ONLINE MUSIC & AUDIUS API
     ======================================================================== */

  /**
   * Search tracks online via Audius.
   */
  async searchMusic({ query, genre, limit = 20, offset = 0 } = {}, baseUrl) {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (genre && genre !== "all") params.set("genre", genre);
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));
    return await request(`/api/music/search?${params.toString()}`, { baseUrl });
  },

  /**
   * Get trending tracks online via Audius.
   */
  async getTrendingMusic({ genre, time = "week", limit = 25, offset = 0 } = {}, baseUrl) {
    const params = new URLSearchParams();
    if (genre && genre !== "all") params.set("genre", genre);
    if (time) params.set("time", time);
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));
    return await request(`/api/music/trending?${params.toString()}`, { baseUrl });
  },

  /**
   * Search artists online via Audius.
   */
  async searchArtists({ query, limit = 10 } = {}, baseUrl) {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (limit) params.set("limit", String(limit));
    return await request(`/api/music/artists/search?${params.toString()}`, { baseUrl });
  },

  /**
   * Get details for a single track.
   */
  async getTrackDetails(trackId, baseUrl) {
    return await request(`/api/music/tracks/${encodeURIComponent(trackId)}`, { baseUrl });
  },

  /**
   * Get profile for an artist.
   */
  async getArtistDetails(artistId, baseUrl) {
    return await request(`/api/music/artists/${encodeURIComponent(artistId)}`, { baseUrl });
  },

  /**
   * Get tracks by an artist.
   */
  async getArtistTracks(artistId, limit = 20, baseUrl) {
    return await request(
      `/api/music/artists/${encodeURIComponent(artistId)}/tracks?limit=${limit}`,
      { baseUrl }
    );
  },

  /**
   * Get full streaming URL for an online track.
   */
  getStreamUrl(trackId, baseUrl) {
    const base = baseUrl || getBaseUrl();
    return `${base.replace(/\/$/, "")}/api/music/stream/${encodeURIComponent(trackId)}`;
  },
};

export default api;
