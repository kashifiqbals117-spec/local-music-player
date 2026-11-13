const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const UserLibraryService = require("../backend/src/services/userLibraryService.cjs");

async function runUserLibraryTests() {
  console.log("=== RUNNING SYNCBEAT USER LIBRARY PERSISTENCE TESTS ===");

  const tempFile = path.join(os.tmpdir(), `syncbeat_test_lib_${Date.now()}.json`);
  const service = new UserLibraryService(tempFile);

  try {
    // 1. Initial user creation
    const user1 = service.getLibrary("usr_alice");
    assert.strictEqual(user1.userId, "usr_alice");
    assert(user1.syncKey.startsWith("SB-"), "Must assign syncKey");
    assert.strictEqual(user1.likedTracks.length, 0);
    assert.strictEqual(user1.playlists.length, 1); // Default Favorites playlist
    console.log(`✔ Test 1: User library initialized with syncKey ${user1.syncKey}`);

    // 2. Toggle like
    const trackA = {
      id: "audius_song_1",
      title: "Neon Echoes",
      artist: "Cyber Artist",
      duration: 195,
      source: "audius",
      streamUrl: "/api/music/stream/audius_song_1",
    };
    const likeRes1 = service.toggleLike("usr_alice", trackA);
    assert.strictEqual(likeRes1.success, true);
    assert.strictEqual(likeRes1.isLiked, true);
    assert.strictEqual(likeRes1.likedTracks.length, 1);
    console.log("✔ Test 2: Liked track added to library");

    // Unlike
    const likeRes2 = service.toggleLike("usr_alice", trackA);
    assert.strictEqual(likeRes2.isLiked, false);
    assert.strictEqual(likeRes2.likedTracks.length, 0);
    console.log("✔ Test 3: Unliked track removed from library");

    // Re-like
    service.toggleLike("usr_alice", trackA);

    // 3. Playlists: Create, Add Track, Update, Delete
    const plRes = service.createPlaylist("usr_alice", {
      name: "Workout Mix",
      description: "High energy tracks",
    });
    assert.strictEqual(plRes.success, true);
    const plId = plRes.playlist.id;
    assert.strictEqual(plRes.playlist.name, "Workout Mix");
    console.log("✔ Test 4: Custom playlist created");

    const addTrackPl = service.addTrackToPlaylist("usr_alice", plId, trackA);
    assert.strictEqual(addTrackPl.success, true);
    assert.strictEqual(addTrackPl.playlist.tracks.length, 1);
    console.log("✔ Test 5: Track added to playlist");

    // Duplicate prevention
    const addDup = service.addTrackToPlaylist("usr_alice", plId, trackA);
    assert.strictEqual(addDup.success, false);
    console.log("✔ Test 6: Duplicate track addition prevented");

    // 4. Recently Played History
    service.recordHistory("usr_alice", trackA);
    const libCheck = service.getLibrary("usr_alice");
    assert.strictEqual(libCheck.recentlyPlayed.length, 1);
    assert.strictEqual(libCheck.recentlyPlayed[0].title, "Neon Echoes");
    console.log("✔ Test 7: Recently played track logged to history");

    // 5. Cross-Device Library Sync via Sync Key
    const aliceSyncKey = user1.syncKey;
    const syncRes = service.syncWithKey("usr_phone_bob", aliceSyncKey);
    assert.strictEqual(syncRes.success, true);
    assert.strictEqual(syncRes.library.likedTracks.length, 1);
    assert(syncRes.library.playlists.some((p) => p.name === "Workout Mix"));
    console.log("✔ Test 8: Cross-device sync merged Alice's library into Bob's device using Sync Key");

    // Invalid sync key
    const invalidSync = service.syncWithKey("usr_phone_bob", "INVALID_KEY_999");
    assert.strictEqual(invalidSync.success, false);
    console.log("✔ Test 9: Invalid sync key cleanly rejected");

    // 6. Persistence verification
    const serviceReload = new UserLibraryService(tempFile);
    const reloadedAlice = serviceReload.getLibrary("usr_alice");
    assert.strictEqual(reloadedAlice.likedTracks.length, 1);
    assert(reloadedAlice.playlists.some((p) => p.name === "Workout Mix"));
    console.log("✔ Test 10: Library survived service reload from disk storage");

    console.log("=== ALL USER LIBRARY PERSISTENCE TESTS PASSED ===\n");
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
}

if (require.main === module) {
  runUserLibraryTests().catch((err) => {
    console.error("User library test failed:", err);
    process.exit(1);
  });
}

module.exports = { runUserLibraryTests };
