const assert = require("assert");
const { SessionManager } = require("../backend/src/services/sessionManager.cjs");

async function runSessionQueueTests() {
  console.log("=== RUNNING SYNCBEAT SHARED SESSION QUEUE TESTS ===");

  const manager = new SessionManager();
  const created = manager.createSession({ hostName: "DJ-Host", mode: "online" });
  const sessionId = created.session.id;
  const hostToken = created.hostToken;

  assert(Array.isArray(created.session.queue), "Session state must contain queue array");
  assert.strictEqual(created.session.queue.length, 0, "Initial queue must be empty");
  console.log("✔ Test 1: Session initialized with empty shared queue");

  // 1. Add tracks to queue
  const track1 = {
    id: "track_1",
    title: "Midnight Drive",
    artist: "SynthWave Producer",
    duration: 210,
    source: "audius",
    streamUrl: "/api/music/stream/track_1",
  };
  const addRes1 = manager.addToQueue(sessionId, hostToken, track1, "DJ-Host");
  assert.strictEqual(addRes1.success, true);
  assert.strictEqual(addRes1.queue.length, 1);
  assert.strictEqual(addRes1.item.title, "Midnight Drive");
  assert(addRes1.item.queueId, "Must assign unique queueId");
  console.log("✔ Test 2: Added online track to queue");

  const track2 = {
    id: "track_2",
    title: "Summer Breeze",
    artist: "Acoustic Duo",
    duration: 180,
    source: "local",
    filePath: "/local/path/summer.mp3",
  };
  const addRes2 = manager.addToQueue(sessionId, hostToken, track2, "DJ-Host");
  assert.strictEqual(addRes2.success, true);
  assert.strictEqual(addRes2.queue.length, 2);
  console.log("✔ Test 3: Added local track to queue");

  const track3 = {
    id: "track_3",
    title: "Deep Techno",
    artist: "Club DJ",
    duration: 320,
    source: "audius",
  };
  const addRes3 = manager.addToQueue(sessionId, hostToken, track3, "DJ-Host");
  assert.strictEqual(addRes3.queue.length, 3);

  // 2. Reorder queue
  const reorderRes = manager.reorderQueue(sessionId, hostToken, 2, 0);
  assert.strictEqual(reorderRes.success, true);
  assert.strictEqual(reorderRes.queue[0].title, "Deep Techno");
  assert.strictEqual(reorderRes.queue[1].title, "Midnight Drive");
  assert.strictEqual(reorderRes.queue[2].title, "Summer Breeze");
  console.log("✔ Test 4: Reordered tracks in queue (moved track 3 to top)");

  // 3. Remove track by queueId
  const itemToRemove = reorderRes.queue[1]; // Midnight Drive
  const removeRes = manager.removeFromQueue(sessionId, hostToken, itemToRemove.queueId);
  assert.strictEqual(removeRes.success, true);
  assert.strictEqual(removeRes.queue.length, 2);
  assert(!removeRes.queue.some((i) => i.queueId === itemToRemove.queueId));
  console.log("✔ Test 5: Removed track from queue by queueId");

  // 4. Play next in queue
  const nextRes = manager.playNextInQueue(sessionId, hostToken);
  assert.strictEqual(nextRes.success, true);
  assert.strictEqual(nextRes.track.title, "Deep Techno");
  assert.strictEqual(nextRes.queue.length, 1);
  assert.strictEqual(nextRes.queue[0].title, "Summer Breeze");

  const publicState = manager.getPublicState(sessionId);
  assert.strictEqual(publicState.currentTrack.title, "Deep Techno");
  assert.strictEqual(publicState.queue.length, 1);
  console.log("✔ Test 6: Played next track from queue, updating currentTrack and queue simultaneously");

  // 5. Unauthorized control rejected
  const fakeToken = "invalid_token_12345";
  const unauthAdd = manager.addToQueue(sessionId, fakeToken, track1);
  assert.strictEqual(unauthAdd.success, false);
  assert(unauthAdd.error.includes("Unauthorized"));
  console.log("✔ Test 7: Unauthorized queue mutations cleanly rejected");

  // 6. Clear queue
  const clearRes = manager.clearQueue(sessionId, hostToken);
  assert.strictEqual(clearRes.success, true);
  assert.strictEqual(clearRes.queue.length, 0);
  console.log("✔ Test 8: Cleared shared queue");

  console.log("=== ALL SHARED SESSION QUEUE TESTS PASSED ===\n");
}

if (require.main === module) {
  runSessionQueueTests().catch((err) => {
    console.error("Session queue test failed:", err);
    process.exit(1);
  });
}

module.exports = { runSessionQueueTests };
