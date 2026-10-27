const assert = require("assert");
const { SessionManager } = require("../server/sessionManager.cjs");

function runResyncEdgeCaseTests() {
  console.log("=== RUNNING RESYNC PROTOCOL EDGE CASE TESTS ===");

  const manager = new SessionManager();
  const host = manager.createSession({ hostName: "HostAlice" });
  const sessionId = host.session.id;

  // Setup 3 participants
  const p1 = manager.joinSession(sessionId, { name: "Guest1", socketId: "s1" });
  const p2 = manager.joinSession(sessionId, { name: "Guest2", socketId: "s2" });
  const p3 = manager.joinSession(sessionId, { name: "Guest3", socketId: "s3" });

  const track = {
    id: "track_alpha_1",
    title: "Alpha Song",
    duration: 200,
    hash: "abc123hash",
  };
  manager.setTrack(sessionId, host.hostToken, track);

  // 1. One participant requests resync -> becomes reference device
  const resync1 = manager.startResync(sessionId, p2.participant.id, {
    trackId: "track_alpha_1",
    position: 75.3,
    isPlaying: true,
  });
  assert(resync1.success, "Resync start must succeed");
  assert.strictEqual(resync1.resyncCommand.referenceParticipantId, p2.participant.id);
  assert.strictEqual(resync1.resyncCommand.position, 75.3);
  console.log("✔ Edge Case 1: Participant designated reference device at position 75.3s");

  // 2. Playback state immediately paused during resync
  assert.strictEqual(manager.getSession(sessionId).playback.state, "paused");
  console.log("✔ Edge Case 2: Session immediately paused upon resync start");

  // 3. Concurrent resync request rejected while first resync active
  const concurrentResync = manager.startResync(sessionId, p1.participant.id, {
    trackId: "track_alpha_1",
    position: 70,
  });
  assert.strictEqual(concurrentResync.success, false, "Concurrent resync must be rejected");
  assert(concurrentResync.error.includes("already in progress"), "Error should explain collision");
  console.log("✔ Edge Case 3: Concurrent resync request rejected with message:", concurrentResync.error);

  // 4. Mismatched track rejected
  const mismatchedResync = manager.startResync(sessionId, p3.participant.id, {
    trackId: "different_track_id",
    position: 10,
  });
  assert.strictEqual(mismatchedResync.success, false, "Mismatched track must be rejected");
  console.log("✔ Edge Case 4: Mismatched track resync rejected");

  // 5. Participants acknowledge alignment
  const ackP1 = manager.acknowledgeResync(sessionId, p1.participant.id, {
    opId: resync1.resyncCommand.opId,
    ready: true,
    position: 75.3,
  });
  assert.strictEqual(ackP1.allAcksReceived, false, "Not all acks received yet (p3 pending)");

  const ackP3 = manager.acknowledgeResync(sessionId, p3.participant.id, {
    opId: resync1.resyncCommand.opId,
    ready: true,
    position: 75.3,
  });
  assert.strictEqual(ackP3.allAcksReceived, true, "All connected participants acknowledged");
  console.log("✔ Edge Case 5: All participant ACKs collected successfully");

  // 6. Commit resynchronization with scheduled future resume
  const commit = manager.commitResync(sessionId, resync1.resyncCommand.opId, 1200);
  assert(commit.success);
  assert.strictEqual(commit.commit.position, 75.3);
  assert.strictEqual(commit.commit.state, "playing");
  assert(commit.commit.scheduledResumeAt > Date.now());
  assert.strictEqual(commit.commit.readyParticipants.length, 3);
  console.log("✔ Edge Case 6: Resync commit scheduled with all 3 participants ready");

  // 7. Duplicate / Stale ACKs ignored after commit
  const staleAck = manager.acknowledgeResync(sessionId, p1.participant.id, {
    opId: resync1.resyncCommand.opId,
    ready: true,
  });
  assert.strictEqual(staleAck.allAcksReceived, false, "Stale ACK must be ignored");
  console.log("✔ Edge Case 7: Stale ACK after commit ignored cleanly");

  // 8. Stale playback command revision rejected
  const stalePlayback = manager.setPlayback(sessionId, host.hostToken, {
    state: "playing",
    position: 50,
    revision: commit.commit.revision - 1, // older revision
  });
  assert.strictEqual(stalePlayback.success, false, "Stale revision must be rejected");
  console.log("✔ Edge Case 8: Stale playback revision rejected");

  // 9. Reference device disconnect during resync
  const resync2 = manager.startResync(sessionId, p1.participant.id, {
    trackId: "track_alpha_1",
    position: 120,
    isPlaying: true,
  });
  assert(resync2.success);

  // Disconnect p1 (the reference device)
  const disc = manager.handleSocketDisconnect("s1");
  assert(disc.session.resyncState.interrupted, "Interrupted flag set on reference disconnect");

  // Abort cleanly
  const aborted = manager.abortResync(sessionId, resync2.resyncCommand.opId, "Reference device disconnected");
  assert.strictEqual(aborted, true);
  console.log("✔ Edge Case 9: Reference device disconnect handled and aborted safely");

  // 10. Resync when session was already paused restores paused state
  const resync3 = manager.startResync(sessionId, p2.participant.id, {
    trackId: "track_alpha_1",
    position: 15,
    isPlaying: false, // device was paused
  });
  assert(resync3.success);
  manager.acknowledgeResync(sessionId, p3.participant.id, {
    opId: resync3.resyncCommand.opId,
    ready: true,
  });
  const commitPaused = manager.commitResync(sessionId, resync3.resyncCommand.opId);
  assert.strictEqual(commitPaused.commit.state, "paused", "Should preserve paused state if requested as paused");
  console.log("✔ Edge Case 10: Preserved paused state when reference was paused");

  console.log("\n=== ALL RESYNC PROTOCOL EDGE CASES PASSED SUCCESSFULLY ===\n");
}

runResyncEdgeCaseTests();
