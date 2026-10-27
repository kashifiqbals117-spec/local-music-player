const assert = require("assert");
const { SessionManager } = require("../server/sessionManager.cjs");

function runTests() {
  console.log("=== RUNNING PHASE 1: SESSION MANAGEMENT TESTS ===");

  const manager = new SessionManager();

  // Test 1: Session creation
  const host = manager.createSession({ hostName: "Alice" });
  assert(host.session.id, "Session must have an ID");
  assert(host.hostToken, "Session must have a hostToken");
  assert.strictEqual(host.session.participantCount, 0, "Host not connected via socket yet");
  console.log("✔ Test 1 Passed: Session created successfully with ID:", host.session.id);

  // Test 2: Two clients join the same session
  const join1 = manager.joinSession(host.session.id, {
    name: "Bob",
    socketId: "socket_bob_1",
  });
  assert(join1.success, "Bob should join successfully");
  assert.strictEqual(join1.participant.name, "Bob");

  const join2 = manager.joinSession(host.session.id, {
    name: "Charlie",
    socketId: "socket_charlie_1",
  });
  assert(join2.success, "Charlie should join successfully");
  assert.strictEqual(join2.participant.name, "Charlie");

  const stateAfterJoins = manager.getPublicState(host.session.id);
  assert.strictEqual(stateAfterJoins.participantCount, 2, "Should show 2 connected participants");
  const names = stateAfterJoins.participants.filter(p => p.connected).map(p => p.name);
  assert(names.includes("Bob") && names.includes("Charlie"), "Both participants must be listed");
  console.log("✔ Test 2 Passed: Multiple clients joined and visible in participant list:", names);

  // Test 3: Unauthorized control rejected
  const fakeToken = "invalid_token_123456";
  const authCheck = manager.isHostAuthorized(host.session.id, fakeToken);
  assert.strictEqual(authCheck, false, "Fake token must not be authorized");

  const unauthorizedPlayback = manager.setPlayback(host.session.id, fakeToken, {
    state: "playing",
    position: 10,
  });
  assert.strictEqual(unauthorizedPlayback.success, false, "Unauthorized playback command must be rejected");

  const authorizedPlayback = manager.setPlayback(host.session.id, host.hostToken, {
    state: "playing",
    position: 0,
  });
  assert.strictEqual(authorizedPlayback.success, true, "Valid host token must be accepted");
  console.log("✔ Test 3 Passed: Unauthorized control rejected and host token verified");

  // Test 4: Host kicks a participant
  const kickResult = manager.removeParticipant(host.session.id, host.hostToken, join2.participant.id);
  assert.strictEqual(kickResult.success, true, "Host should be able to kick participant");
  assert.strictEqual(manager.getSession(host.session.id).participants.has(join2.participant.id), false);
  console.log("✔ Test 4 Passed: Host can remove participant");

  // Test 5: Disconnecting a participant updates state
  const disconnectInfo = manager.handleSocketDisconnect("socket_bob_1");
  assert(disconnectInfo, "Disconnect info should be returned");
  assert.strictEqual(disconnectInfo.participant.connected, false, "Participant should be marked disconnected");
  assert.strictEqual(manager.getPublicState(host.session.id).participantCount, 0, "Connected participant count should update to 0");
  console.log("✔ Test 5 Passed: Disconnect properly marks participant disconnected");

  // Test 6: Reconnection with existing clientToken
  const reconnectResult = manager.joinSession(host.session.id, {
    name: "Bob",
    socketId: "socket_bob_2",
    participantId: join1.participant.id,
    clientToken: join1.clientToken,
  });
  assert.strictEqual(reconnectResult.success, true, "Reconnect should succeed");
  assert.strictEqual(reconnectResult.isReconnect, true, "Should identify as reconnection");
  assert.strictEqual(manager.getPublicState(host.session.id).participantCount, 1, "Connected count should be restored to 1");
  console.log("✔ Test 6 Passed: Participant successfully reconnected using client token");

  // Test 7: Non-existent session rejected
  const badSession = manager.joinSession("NONEXISTENT", { name: "Dave" });
  assert.strictEqual(badSession.success, false, "Joining invalid session must fail");
  console.log("✔ Test 7 Passed: Invalid session IDs rejected");

  console.log("\n=== ALL PHASE 1 SESSION MANAGEMENT TESTS PASSED ===\n");
}

try {
  runTests();
} catch (err) {
  console.error("Test failed:", err);
  process.exit(1);
}
