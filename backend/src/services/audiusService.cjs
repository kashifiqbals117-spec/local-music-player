/**
 * Audius API Service Layer for SyncBeat.
 * Handles discovery node selection, track search, trending tracks, track details,
 * artist information, streaming URLs, and resilient caching & failover.
 */

const FALLBACK_DISCOVERY_NODES = [
  "https://api.audius.co",
  "https://discoveryprovider.audius.co",
  "https://audius-discovery-1.cultur3stake.com",
  "https://discoveryprovider2.audius.co",
];

class AudiusService {
  /**
   * @param {Object} [options]
   * @param {string} [options.appName]
   * @param {string} [options.apiKey]
   * @param {string[]} [options.discoveryNodes]
   * @param {number} [options.timeoutMs]
   */
  constructor(options = {}) {
    this.appName = options.appName || process.env.AUDIUS_APP_NAME || "SyncBeat";
    this.apiKey = options.apiKey || process.env.AUDIUS_API_KEY || null;
    this.discoveryNodes = options.discoveryNodes || [...FALLBACK_DISCOVERY_NODES];
    this.currentNodeIndex = 0;
    this.timeoutMs = options.timeoutMs || 10000;

    /** @type {Map<string, { data: any, expiresAt: number }>} */
    this.cache = new Map();
    this.cacheTtlMs = 5 * 60 * 1000; // 5 minutes default
    this.longCacheTtlMs = 30 * 60 * 1000; // 30 minutes for track/artist details

    // Initial node resolution in background
    this.resolveHealthyNodes().catch(() => {});
  }

  /**
   * Get currently active discovery node host.
   * @returns {string}
   */
  getActiveHost() {
    return this.discoveryNodes[this.currentNodeIndex] || "https://api.audius.co";
  }

  /**
   * Rotate to next available discovery node on failure.
   */
  rotateHost() {
    this.currentNodeIndex = (this.currentNodeIndex + 1) % this.discoveryNodes.length;
    console.log(`[AudiusService] Rotated to discovery node: ${this.getActiveHost()}`);
  }

  /**
   * Query the Audius gateway to discover healthy active nodes.
   */
  async resolveHealthyNodes() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch("https://api.audius.co", {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          const freshNodes = json.data.filter((node) => typeof node === "string" && node.startsWith("http"));
          if (freshNodes.length > 0) {
            // Keep unique nodes with priority to newly fetched ones
            this.discoveryNodes = Array.from(new Set([...freshNodes, ...FALLBACK_DISCOVERY_NODES]));
            console.log(`[AudiusService] Loaded ${this.discoveryNodes.length} healthy discovery nodes.`);
          }
        }
      }
    } catch (err) {
      console.warn("[AudiusService] Could not refresh node list from gateway, using fallback nodes:", err.message);
    }
  }

  /**
   * Retrieve item from cache if not expired.
   * @param {string} key
   * @returns {any|null}
   */
  getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  /**
   * Store item in cache with TTL.
   * @param {string} key
   * @param {any} data
   * @param {number} [ttlMs]
   */
  setCached(key, data, ttlMs = this.cacheTtlMs) {
    // Prevent unbounded memory growth: keep max 300 items
    if (this.cache.size > 300) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Execute an Audius API request with retry across discovery nodes.
   * @param {string} endpoint - Path such as "/v1/tracks/trending"
   * @param {Record<string, string|number|boolean>} [params]
   * @returns {Promise<any>}
   */
  async request(endpoint, params = {}) {
    const attempts = Math.min(3, this.discoveryNodes.length);
    let lastError = null;

    for (let i = 0; i < attempts; i++) {
      const host = this.getActiveHost();
      const url = new URL(endpoint.startsWith("/") ? endpoint : `/${endpoint}`, host);

      // Append default app_name
      url.searchParams.set("app_name", this.appName);

      // Append custom query parameters
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null && val !== "") {
          url.searchParams.set(key, String(val));
        }
      }

      const headers = {
        Accept: "application/json",
      };
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(url.toString(), {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          const status = res.status;
          // If 404 (track not found) or 403 (restricted), don't failover to other hosts
          if (status === 404 || status === 400 || status === 403) {
            const error = new Error(errText || `Audius API responded with HTTP ${status}`);
            error.status = status;
            throw error;
          }
          throw new Error(`Node ${host} responded with HTTP ${status}: ${errText.slice(0, 100)}`);
        }

        const data = await res.json();
        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        // Don't rotate if it's a client error like 404/400
        if (err.status && err.status < 500) {
          throw err;
        }
        console.warn(`[AudiusService] Request to ${host}${endpoint} failed: ${err.message}. Rotating host...`);
        this.rotateHost();
      }
    }

    throw lastError || new Error("Failed to communicate with Audius network.");
  }

  /**
   * Format raw Audius track object into standardized SyncBeat track format.
   * @param {Object} raw
   * @returns {Object}
   */
  formatTrack(raw) {
    if (!raw) return null;

    const id = String(raw.id || raw.track_id || "");
    const artwork = raw.artwork || {};
    const bestArtwork = artwork["480x480"] || artwork["1000x1000"] || artwork["150x150"] || null;

    const artistName = raw.user?.name || raw.user?.handle || "Unknown Artist";
    const userHandle = raw.user?.handle ? `@${raw.user.handle}` : "";

    return {
      id,
      trackId: raw.track_id || id,
      title: (raw.title || "Untitled Track").trim(),
      name: (raw.title || "Untitled Track").trim(),
      artist: artistName,
      artistHandle: userHandle,
      user: raw.user
        ? {
            id: raw.user.id || raw.user.user_id,
            name: raw.user.name,
            handle: raw.user.handle,
            verified: Boolean(raw.user.is_verified),
            profilePicture: raw.user.profile_picture?.["150x150"] || null,
          }
        : null,
      album: raw.album || "",
      genre: raw.genre || "Music",
      mood: raw.mood || "",
      duration: Math.round(Number(raw.duration) || 0),
      artwork: bestArtwork,
      artworkSizes: artwork,
      playCount: raw.play_count || 0,
      repostCount: raw.repost_count || 0,
      favoriteCount: raw.favorite_count || 0,
      isStreamable: raw.is_streamable !== false,
      isAvailable: raw.is_available !== false,
      source: "audius",
      streamUrl: `/api/music/stream/${id}`,
      permalink: raw.permalink ? `https://audius.co${raw.permalink}` : null,
    };
  }

  /**
   * Fetch trending tracks from Audius.
   * @param {Object} [options]
   * @param {string} [options.genre]
   * @param {string} [options.time] - 'week' | 'month' | 'all'
   * @param {number} [options.limit=25]
   * @param {number} [options.offset=0]
   * @returns {Promise<{ tracks: Object[], total: number }>}
   */
  async getTrendingTracks({ genre, time = "week", limit = 25, offset = 0 } = {}) {
    const cacheKey = `trending_${genre || "all"}_${time}_${limit}_${offset}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const params = { limit, offset, time };
    if (genre && genre !== "all") {
      params.genre = genre;
    }

    const response = await this.request("/v1/tracks/trending", params);
    const rawList = Array.isArray(response?.data) ? response.data : [];

    const tracks = rawList
      .filter((t) => t && t.is_streamable !== false && !t.is_delete)
      .map((t) => this.formatTrack(t));

    const result = { tracks, total: tracks.length };
    this.setCached(cacheKey, result, this.cacheTtlMs);
    return result;
  }

  /**
   * Search tracks on Audius.
   * @param {Object} options
   * @param {string} options.query
   * @param {string} [options.genre]
   * @param {number} [options.limit=25]
   * @param {number} [options.offset=0]
   * @returns {Promise<{ tracks: Object[], total: number }>}
   */
  async searchTracks({ query, genre, limit = 25, offset = 0 } = {}) {
    const cleanQuery = (query || "").trim();
    if (!cleanQuery) {
      return { tracks: [], total: 0 };
    }

    const cacheKey = `search_${cleanQuery.toLowerCase()}_${genre || "all"}_${limit}_${offset}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const params = { query: cleanQuery, limit, offset };
    if (genre && genre !== "all") {
      params.genre = genre;
    }

    const response = await this.request("/v1/tracks/search", params);
    const rawList = Array.isArray(response?.data) ? response.data : [];

    const tracks = rawList
      .filter((t) => t && t.is_streamable !== false && !t.is_delete)
      .map((t) => this.formatTrack(t));

    const result = { tracks, total: tracks.length };
    this.setCached(cacheKey, result, this.cacheTtlMs);
    return result;
  }

  /**
   * Search artists / users on Audius.
   * @param {Object} options
   * @param {string} options.query
   * @param {number} [options.limit=10]
   * @returns {Promise<{ artists: Object[] }>}
   */
  async searchArtists({ query, limit = 10 } = {}) {
    const cleanQuery = (query || "").trim();
    if (!cleanQuery) return { artists: [] };

    const cacheKey = `artists_${cleanQuery.toLowerCase()}_${limit}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const response = await this.request("/v1/users/search", { query: cleanQuery, limit });
    const rawList = Array.isArray(response?.data) ? response.data : [];

    const artists = rawList.map((u) => ({
      id: u.id || u.user_id,
      name: u.name,
      handle: u.handle,
      bio: u.bio || "",
      verified: Boolean(u.is_verified),
      followerCount: u.follower_count || 0,
      trackCount: u.track_count || 0,
      profilePicture: u.profile_picture?.["480x480"] || u.profile_picture?.["150x150"] || null,
      coverPhoto: u.cover_photo?.["640x"] || null,
    }));

    const result = { artists };
    this.setCached(cacheKey, result, this.cacheTtlMs);
    return result;
  }

  /**
   * Fetch single track details.
   * @param {string} trackId
   * @returns {Promise<Object|null>}
   */
  async getTrack(trackId) {
    if (!trackId) return null;
    const cleanId = String(trackId).trim();

    const cacheKey = `track_${cleanId}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const response = await this.request(`/v1/tracks/${encodeURIComponent(cleanId)}`);
    const raw = response?.data;
    if (!raw) return null;

    const track = this.formatTrack(raw);
    this.setCached(cacheKey, track, this.longCacheTtlMs);
    return track;
  }

  /**
   * Fetch artist profile by ID or handle.
   * @param {string} userId
   * @returns {Promise<Object|null>}
   */
  async getArtist(userId) {
    if (!userId) return null;
    const cleanId = String(userId).trim();

    const cacheKey = `user_${cleanId}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const response = await this.request(`/v1/users/${encodeURIComponent(cleanId)}`);
    const u = response?.data;
    if (!u) return null;

    const artist = {
      id: u.id || u.user_id,
      name: u.name,
      handle: u.handle,
      bio: u.bio || "",
      location: u.location || "",
      verified: Boolean(u.is_verified),
      followerCount: u.follower_count || 0,
      trackCount: u.track_count || 0,
      profilePicture: u.profile_picture?.["480x480"] || u.profile_picture?.["150x150"] || null,
      coverPhoto: u.cover_photo?.["640x"] || null,
    };

    this.setCached(cacheKey, artist, this.longCacheTtlMs);
    return artist;
  }

  /**
   * Fetch tracks by an artist.
   * @param {string} userId
   * @param {number} [limit=20]
   * @returns {Promise<{ tracks: Object[] }>}
   */
  async getArtistTracks(userId, limit = 20) {
    if (!userId) return { tracks: [] };
    const cleanId = String(userId).trim();

    const cacheKey = `user_tracks_${cleanId}_${limit}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const response = await this.request(`/v1/users/${encodeURIComponent(cleanId)}/tracks`, { limit });
    const rawList = Array.isArray(response?.data) ? response.data : [];

    const tracks = rawList
      .filter((t) => t && t.is_streamable !== false && !t.is_delete)
      .map((t) => this.formatTrack(t));

    const result = { tracks };
    this.setCached(cacheKey, result, this.cacheTtlMs);
    return result;
  }

  /**
   * Build the direct Audius stream URL for a given track ID.
   * @param {string} trackId
   * @returns {string}
   */
  getDirectStreamUrl(trackId) {
    const cleanId = String(trackId).trim();
    const host = this.getActiveHost();
    const appName = encodeURIComponent(this.appName);
    return `${host}/v1/tracks/${encodeURIComponent(cleanId)}/stream?app_name=${appName}`;
  }

  /**
   * Stream track audio, supporting Range requests or redirecting to creator node.
   * If client supports redirect or requests direct streaming, handles Range requests and piping.
   * @param {string} trackId
   * @param {import("express").Request} req
   * @param {import("express").Response} res
   */
  async streamTrack(trackId, req, res) {
    const cleanId = String(trackId).trim();
    const streamTargetUrl = this.getDirectStreamUrl(cleanId);

    // If client asks for redirect via query param ?redirect=true, redirect directly
    if (req.query?.redirect === "true") {
      return res.redirect(302, streamTargetUrl);
    }

    try {
      const headers = {
        "User-Agent": `SyncBeat-Server/1.0 (${this.appName})`,
      };

      if (req.headers.range) {
        headers["Range"] = req.headers.range;
      }

      // Fetch upstream audio stream from Audius (following redirects automatically)
      const upstreamRes = await fetch(streamTargetUrl, {
        headers,
        redirect: "follow",
      });

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        // Fallback: if upstream failed or restricted, attempt direct 302 redirect
        return res.redirect(302, streamTargetUrl);
      }

      const contentType = upstreamRes.headers.get("content-type") || "audio/mpeg";
      const contentLength = upstreamRes.headers.get("content-length");
      const contentRange = upstreamRes.headers.get("content-range");
      const acceptRanges = upstreamRes.headers.get("accept-ranges") || "bytes";

      res.status(upstreamRes.status);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Accept-Ranges", acceptRanges);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (contentRange) res.setHeader("Content-Range", contentRange);

      if (!upstreamRes.body) {
        return res.end();
      }

      // Pipe ReadableStream to Express response
      const { Readable } = require("stream");
      Readable.fromWeb(upstreamRes.body).pipe(res);
    } catch (err) {
      console.warn(`[AudiusService] Streaming error for track ${cleanId}: ${err.message}. Redirecting to source...`);
      if (!res.headersSent) {
        res.redirect(302, streamTargetUrl);
      }
    }
  }
}

module.exports = {
  AudiusService,
  FALLBACK_DISCOVERY_NODES,
};

