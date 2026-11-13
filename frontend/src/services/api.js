/**
 * Centralized HTTP API Client for SyncBeat.
 * Handles base URL resolution, headers, timeouts, and error handling.
 */

import musicService from "./musicService";

export const RENDER_BACKEND_URL = "https://local-music-player.onrender.com";

/**
 * Sanitize API URLs to fix typos, strip trailing slashes, and redirect Vercel domain hits.
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== "string") return RENDER_BACKEND_URL;
  let cleaned = url.trim().replace(/\/$/, "");
  if (!cleaned || cleaned === "/" || cleaned.startsWith("/api")) {
    return RENDER_BACKEND_URL;
  }
  // Defensive correction for accidental typos like .onrender.co
  if (cleaned.endsWith(".onrender.co")) {
    cleaned += "m";
  }
  // Vercel only hosts static frontend SPA; redirect any backend calls to Render
  if (cleaned.includes("vercel.app")) {
    return RENDER_BACKEND_URL;
  }
  return cleaned;
}

/**
 * Determine backend base URL.
 * In Electron / local dev: http://localhost:3001
 * In all web browser environments (Vercel, mobile): https://local-music-player.onrender.com
 */
export function getBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  // In Electron desktop environment, always use local loopback
  if (musicService.isElectron()) {
    return "http://localhost:3001";
  }

  // Local development / loopback
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return "http://localhost:3001";
  }

  // If explicitly configured via Vite environment variable, sanitize it
  const envUrl = import.meta.env?.VITE_API_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    const sanitized = sanitizeUrl(envUrl);
    if (!sanitized.includes("vercel.app")) {
      return sanitized;
    }
  }

  // Production web fallback (Vercel production, preview deployments, mobile)
  return RENDER_BACKEND_URL;
}

/**
 * Convert any relative API endpoint or stream path into an absolute URL targeting the backend.
 * @param {string} pathOrUrl
 * @param {string} [customBase]
 * @returns {string}
 */
export function resolveApiUrl(pathOrUrl, customBase) {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return "";

  // Blob and Data URIs for local playback
  if (pathOrUrl.startsWith("blob:") || pathOrUrl.startsWith("data:")) {
    return pathOrUrl;
  }

  // Absolute URLs
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    // If an absolute URL mistakenly targets Vercel frontend, rewrite to Render backend
    if (pathOrUrl.includes("vercel.app")) {
      const parsed = new URL(pathOrUrl);
      const backend = new URL(getBaseUrl());
      parsed.protocol = backend.protocol;
      parsed.host = backend.host;
      return parsed.toString();
    }
    return pathOrUrl;
  }

  // Relative paths
  let base;
  if (customBase && typeof customBase === "string") {
    base = sanitizeUrl(customBase);
  } else {
    base = getBaseUrl();
  }

  if (base.includes("vercel.app")) {
    base = RENDER_BACKEND_URL;
  }

  const cleanPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base.replace(/\/$/, "")}${cleanPath}`;
}

/**
 * Standard fetch wrapper with timeout and JSON handling.
 */
async function request(endpoint, options = {}) {
  let baseUrl;
  if (options.baseUrl && typeof options.baseUrl === "string") {
    const candidate = sanitizeUrl(options.baseUrl);
    baseUrl = candidate.includes("vercel.app") ? getBaseUrl() : candidate;
  } else {
    baseUrl = getBaseUrl();
  }

  // Never allow requests to point to Vercel static origin in production web
  if (!baseUrl || baseUrl.includes("vercel.app") || (baseUrl === window?.location?.origin && !window.location.hostname.includes("localhost"))) {
    baseUrl = RENDER_BACKEND_URL;
  }

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const headers = { ...options.headers };

  // Set Content-Type: application/json if sending a JSON body (and not FormData)
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  // Default timeout 30s to accommodate Render free-tier cold starts
  const timeoutMs = options.timeoutMs || 30000;
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
     SESSION QUEUE API
     ======================================================================== */

  /**
   * Fetch current queue of a session.
   */
  async getSessionQueue(sessionId, baseUrl) {
    return await request(`/api/sessions/${encodeURIComponent(sessionId)}/queue`, { baseUrl });
  },

  /**
   * Add a track to the session queue.
   */
  async addToSessionQueue(sessionId, track, baseUrl) {
    return await request(`/api/sessions/${encodeURIComponent(sessionId)}/queue`, {
      method: "POST",
      baseUrl,
      body: JSON.stringify({ track }),
    });
  },

  /**
   * Remove an item from the session queue.
   */
  async removeFromSessionQueue(sessionId, queueId, baseUrl) {
    return await request(
      `/api/sessions/${encodeURIComponent(sessionId)}/queue/${encodeURIComponent(queueId)}`,
      {
        method: "DELETE",
        baseUrl,
      }
    );
  },

  /**
   * Reorder items in the session queue.
   */
  async reorderSessionQueue(sessionId, fromIndex, toIndex, baseUrl) {
    return await request(`/api/sessions/${encodeURIComponent(sessionId)}/queue/reorder`, {
      method: "PUT",
      baseUrl,
      body: JSON.stringify({ fromIndex, toIndex }),
    });
  },

  /**
   * Pop and play the next item in the session queue.
   */
  async playNextInSessionQueue(sessionId, baseUrl) {
    return await request(`/api/sessions/${encodeURIComponent(sessionId)}/queue/next`, {
      method: "POST",
      baseUrl,
    });
  },

  /**
   * Clear all items from the session queue.
   */
  async clearSessionQueue(sessionId, baseUrl) {
    return await request(`/api/sessions/${encodeURIComponent(sessionId)}/queue`, {
      method: "DELETE",
      baseUrl,
    });
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
    return resolveApiUrl(`/api/music/stream/${encodeURIComponent(trackId)}`, baseUrl);
  },
  resolveApiUrl,
  sanitizeUrl,
};

export default api;
