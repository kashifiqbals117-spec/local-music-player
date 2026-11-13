/**
 * Controller for User Library operations in SyncBeat Online Mode.
 */

function createUserLibraryController({ userLibraryService }) {
  function getUserId(req) {
    return (
      req.headers["x-user-id"] ||
      req.headers["x-user-token"] ||
      req.query.userId ||
      req.body?.userId ||
      "guest_default"
    );
  }

  return {
    getLibrary: (req, res) => {
      const userId = getUserId(req);
      const library = userLibraryService.getLibrary(userId);
      res.json({ success: true, library });
    },

    toggleLike: (req, res) => {
      const userId = getUserId(req);
      const { track } = req.body || {};
      if (!track) return res.status(400).json({ error: "Track data required." });

      const result = userLibraryService.toggleLike(userId, track);
      res.json(result);
    },

    createPlaylist: (req, res) => {
      const userId = getUserId(req);
      const { name, description } = req.body || {};
      const result = userLibraryService.createPlaylist(userId, { name, description });
      res.status(201).json(result);
    },

    updatePlaylist: (req, res) => {
      const userId = getUserId(req);
      const { playlistId } = req.params;
      const result = userLibraryService.updatePlaylist(userId, playlistId, req.body || {});
      res.json(result);
    },

    deletePlaylist: (req, res) => {
      const userId = getUserId(req);
      const { playlistId } = req.params;
      const result = userLibraryService.deletePlaylist(userId, playlistId);
      res.json(result);
    },

    addTrackToPlaylist: (req, res) => {
      const userId = getUserId(req);
      const { playlistId } = req.params;
      const { track } = req.body || {};
      if (!track) return res.status(400).json({ error: "Track data required." });

      const result = userLibraryService.addTrackToPlaylist(userId, playlistId, track);
      if (!result.success) return res.status(400).json(result);
      res.json(result);
    },

    removeTrackFromPlaylist: (req, res) => {
      const userId = getUserId(req);
      const { playlistId, trackId } = req.params;
      const result = userLibraryService.removeTrackFromPlaylist(userId, playlistId, trackId);
      res.json(result);
    },

    recordHistory: (req, res) => {
      const userId = getUserId(req);
      const { track } = req.body || {};
      if (!track) return res.status(400).json({ error: "Track data required." });

      const result = userLibraryService.recordHistory(userId, track);
      res.json(result);
    },

    syncWithKey: (req, res) => {
      const userId = getUserId(req);
      const { syncKey } = req.body || {};
      if (!syncKey) return res.status(400).json({ error: "Sync key required." });

      const result = userLibraryService.syncWithKey(userId, syncKey);
      if (!result.success) return res.status(404).json(result);
      res.json(result);
    },
  };
}

module.exports = { createUserLibraryController };
