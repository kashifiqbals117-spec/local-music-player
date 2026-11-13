/**
 * User Library Routes for SyncBeat Online Mode.
 */

const express = require("express");

function createUserLibraryRoutes({ userLibraryController }) {
  const router = express.Router();

  router.get("/", userLibraryController.getLibrary);
  router.post("/liked", userLibraryController.toggleLike);
  router.post("/playlists", userLibraryController.createPlaylist);
  router.put("/playlists/:playlistId", userLibraryController.updatePlaylist);
  router.delete("/playlists/:playlistId", userLibraryController.deletePlaylist);
  router.post("/playlists/:playlistId/tracks", userLibraryController.addTrackToPlaylist);
  router.delete("/playlists/:playlistId/tracks/:trackId", userLibraryController.removeTrackFromPlaylist);
  router.post("/history", userLibraryController.recordHistory);
  router.post("/sync", userLibraryController.syncWithKey);

  return router;
}

module.exports = { createUserLibraryRoutes };
