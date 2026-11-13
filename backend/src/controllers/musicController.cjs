/**
 * Music Controller for SyncBeat.
 * Handles online music discovery, searching, track metadata, and streaming via Audius.
 */

function createMusicController({ audiusService }) {
  return {
    /**
     * Search online tracks.
     * GET /api/music/search?query=...&genre=...&limit=...
     */
    searchTracks: async (req, res) => {
      try {
        const { query, genre, limit, offset } = req.query;
        if (!query || !query.trim()) {
          return res.status(400).json({ error: "Search query is required." });
        }

        const parsedLimit = Math.min(50, Math.max(1, Number(limit) || 20));
        const parsedOffset = Math.max(0, Number(offset) || 0);

        const result = await audiusService.searchTracks({
          query,
          genre,
          limit: parsedLimit,
          offset: parsedOffset,
        });

        res.json({
          success: true,
          query,
          tracks: result.tracks,
          total: result.total,
        });
      } catch (err) {
        console.error("[MusicController] Search error:", err);
        res.status(err.status || 500).json({
          error: err.message || "Failed to search tracks.",
        });
      }
    },

    /**
     * Get trending online tracks.
     * GET /api/music/trending?genre=...&time=...&limit=...
     */
    getTrending: async (req, res) => {
      try {
        const { genre, time, limit, offset } = req.query;
        const parsedLimit = Math.min(50, Math.max(1, Number(limit) || 25));
        const parsedOffset = Math.max(0, Number(offset) || 0);

        const result = await audiusService.getTrendingTracks({
          genre,
          time: time || "week",
          limit: parsedLimit,
          offset: parsedOffset,
        });

        res.json({
          success: true,
          genre: genre || "all",
          time: time || "week",
          tracks: result.tracks,
          total: result.total,
        });
      } catch (err) {
        console.error("[MusicController] Trending error:", err);
        res.status(err.status || 500).json({
          error: err.message || "Failed to fetch trending tracks.",
        });
      }
    },

    /**
     * Search artists / users.
     * GET /api/music/artists/search?query=...&limit=...
     */
    searchArtists: async (req, res) => {
      try {
        const { query, limit } = req.query;
        if (!query || !query.trim()) {
          return res.status(400).json({ error: "Search query is required." });
        }

        const parsedLimit = Math.min(20, Math.max(1, Number(limit) || 10));
        const result = await audiusService.searchArtists({
          query,
          limit: parsedLimit,
        });

        res.json({
          success: true,
          query,
          artists: result.artists,
        });
      } catch (err) {
        console.error("[MusicController] Search artists error:", err);
        res.status(err.status || 500).json({
          error: err.message || "Failed to search artists.",
        });
      }
    },

    /**
     * Get single track details.
     * GET /api/music/tracks/:id
     */
    getTrack: async (req, res) => {
      try {
        const { id } = req.params;
        const track = await audiusService.getTrack(id);

        if (!track) {
          return res.status(404).json({ error: "Track not found or unavailable." });
        }

        res.json({ success: true, track });
      } catch (err) {
        console.error(`[MusicController] Get track ${req.params.id} error:`, err);
        res.status(err.status || 500).json({
          error: err.message || "Failed to fetch track details.",
        });
      }
    },

    /**
     * Get artist details.
     * GET /api/music/artists/:id
     */
    getArtist: async (req, res) => {
      try {
        const { id } = req.params;
        const artist = await audiusService.getArtist(id);

        if (!artist) {
          return res.status(404).json({ error: "Artist not found." });
        }

        res.json({ success: true, artist });
      } catch (err) {
        console.error(`[MusicController] Get artist ${req.params.id} error:`, err);
        res.status(err.status || 500).json({
          error: err.message || "Failed to fetch artist profile.",
        });
      }
    },

    /**
     * Get tracks by an artist.
     * GET /api/music/artists/:id/tracks
     */
    getArtistTracks: async (req, res) => {
      try {
        const { id } = req.params;
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

        const result = await audiusService.getArtistTracks(id, limit);
        res.json({ success: true, tracks: result.tracks });
      } catch (err) {
        console.error(`[MusicController] Get artist tracks ${req.params.id} error:`, err);
        res.status(err.status || 500).json({
          error: err.message || "Failed to fetch artist tracks.",
        });
      }
    },

    /**
     * Stream audio for a track.
     * GET /api/music/stream/:id
     */
    streamTrack: async (req, res) => {
      try {
        const { id } = req.params;
        await audiusService.streamTrack(id, req, res);
      } catch (err) {
        console.error(`[MusicController] Streaming error for track ${req.params.id}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to stream audio track." });
        }
      }
    },
  };
}

module.exports = { createMusicController };

