/**
 * Music Routes for SyncBeat.
 * Mounts Audius music search, trending tracks, track details, artist info, and streaming.
 */

const express = require("express");

function createMusicRoutes({ musicController }) {
  const router = express.Router();

  // Search & Trending
  router.get("/search", musicController.searchTracks);
  router.get("/trending", musicController.getTrending);
  router.get("/artists/search", musicController.searchArtists);

  // Artist profiles and their tracks
  router.get("/artists/:id/tracks", musicController.getArtistTracks);
  router.get("/artists/:id", musicController.getArtist);

  // Tracks and streaming
  router.get("/tracks/:id", musicController.getTrack);
  router.get("/stream/:id", musicController.streamTrack);

  return router;
}

module.exports = { createMusicRoutes };

