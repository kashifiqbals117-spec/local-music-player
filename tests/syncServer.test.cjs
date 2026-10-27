const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ioClient = require("socket.io-client");
const { createSyncServer, computeFileSha256 } = require("../server/syncServer.cjs");

const TEST_PORT = 3199;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runServerTests() {
  console.log("=== RUNNING SYNCBEAT SERVER & RESYNC PROTOCOL INTEGRATION TESTS ===");

  const syncServer = createSyncServer({ port: TEST_PORT });
  await syncServer.start();
  console.log(`✔ Test server started on port ${TEST_PORT}`);

  const baseUrl = `http://localhost:${TEST_PORT}`;

  try {
    // ------------------------------------------------------------------------
    // 1. Health check endpoint
    // ------------------------------------------------------------------------
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200, "Health check must return 200");
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, "ok");
    console.log("✔ Test 1: Health check passed");

    // ------------------------------------------------------------------------
    // 2. Session Creation (REST API)
    // ------------------------------------------------------------------------
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostName: "DJ Alice", mode: "offline" }),
    });
    assert.strictEqual(createRes.status, 201, "Session creation must return 201");
    const { session, hostToken, clientToken, hostParticipantId } = await createRes.json();
    assert(session.id, "Session must have an ID");
    assert(hostToken, "Must receive hostToken");
    const sessionId = session.id;
    console.log(`✔ Test 2: Created session ${sessionId} with hostToken`);

    // ------------------------------------------------------------------------
    // 3. QR Code generation endpoint
    // ------------------------------------------------------------------------
    const qrRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/qr`);
    assert.strictEqual(qrRes.status, 200, "QR code endpoint must return 200");
    const qrData = await qrRes.json();
    assert(qrData.qrDataUrl.startsWith("data:image/png;base64,"), "QR data URL must be valid base64 PNG");
    assert(qrData.joinUrl.includes(sessionId), "QR join URL must include session ID");
    console.log("✔ Test 3: QR Code generated successfully");

    // ------------------------------------------------------------------------
    // 4. Multi-client Socket.IO Joining (Host + 2 Guests)
    // ------------------------------------------------------------------------
    const hostSocket = ioClient(baseUrl, { reconnection: false });
    const guest1Socket = ioClient(baseUrl, { reconnection: false });
    const guest2Socket = ioClient(baseUrl, { reconnection: false });

    // Host joins
    const hostJoin = await new Promise((resolve) => {
      hostSocket.emit("join-session", {
        sessionId,
        name: "DJ Alice",
        participantId: hostParticipantId,
        clientToken,
      }, resolve);
    });
    assert(hostJoin.success, "Host socket must join session");

    // Guest 1 joins
    const guest1Join = await new Promise((resolve) => {
      guest1Socket.emit("join-session", { sessionId, name: "Bob (Phone)" }, resolve);
    });
    assert(guest1Join.success, "Guest 1 must join session");
    const guest1Id = guest1Join.participant.id;

    // Guest 2 joins
    const guest2Join = await new Promise((resolve) => {
      guest2Socket.emit("join-session", { sessionId, name: "Charlie (Laptop)" }, resolve);
    });
    assert(guest2Join.success, "Guest 2 must join session");
    const guest2Id = guest2Join.participant.id;

    await sleep(100);

    const stateRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
    const currentState = await stateRes.json();
    assert.strictEqual(currentState.participantCount, 3, "Session must have 3 connected participants");
    console.log("✔ Test 4: Host and 2 guests joined via WebSockets (Total: 3 participants)");

    // ------------------------------------------------------------------------
    // 5. Clock Synchronization (NTP-style handshake)
    // ------------------------------------------------------------------------
    const t0 = Date.now();
    const timeSyncResult = await new Promise((resolve) => {
      guest1Socket.emit("time-sync", { clientSendTime: t0 }, resolve);
    });
    const t3 = Date.now();
    assert(timeSyncResult.serverReceiveTime, "Server must return serverReceiveTime");
    assert(timeSyncResult.serverSendTime, "Server must return serverSendTime");
    const rtt = (t3 - t0) - (timeSyncResult.serverSendTime - timeSyncResult.serverReceiveTime);
    const offset = ((timeSyncResult.serverReceiveTime - t0) + (timeSyncResult.serverSendTime - t3)) / 2;
    console.log(`✔ Test 5: Clock synchronization handshake complete (RTT: ${rtt}ms, Clock Offset: ${offset.toFixed(1)}ms)`);

    // ------------------------------------------------------------------------
    // 6. Track Sharing & SHA-256 Verification
    // ------------------------------------------------------------------------
    const testAudioPath = path.resolve(__dirname, "../public/test.mp3");
    assert(fs.existsSync(testAudioPath), "Test audio public/test.mp3 must exist");

    const expectedHash = await computeFileSha256(testAudioPath);
    console.log(`  Audio SHA-256 on disk: ${expectedHash}`);

    // Wait for track-published event
    const trackPublishPromise = new Promise((resolve) => {
      guest1Socket.once("track-published", resolve);
    });

    // Host registers track
    const trackUploadRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-host-token": hostToken,
      },
      body: JSON.stringify({
        localFilePath: testAudioPath,
        title: "Test Track",
        artist: "Test Artist",
        duration: 236,
      }),
    });
    assert.strictEqual(trackUploadRes.status, 201, "Track registration must return 201");
    const trackUploadData = await trackUploadRes.json();
    assert.strictEqual(trackUploadData.track.hash, expectedHash, "Published track hash must match file hash");

    const publishedEvent = await trackPublishPromise;
    assert.strictEqual(publishedEvent.track.id, trackUploadData.track.id);

    // Guest downloads track via HTTP stream and verifies SHA-256
    const downloadRes = await fetch(`${baseUrl}${publishedEvent.downloadUrl}`);
    assert.strictEqual(downloadRes.status, 200, "Track download must succeed");
    const audioBuffer = Buffer.from(await downloadRes.arrayBuffer());
    const downloadedHash = crypto.createHash("sha256").update(audioBuffer).digest("hex");
    assert.strictEqual(downloadedHash, expectedHash, "Downloaded track SHA-256 must match expected hash");

    // Both guests acknowledge readiness
    guest1Socket.emit("track-ready-ack", { sessionId, participantId: guest1Id, isReady: true });
    guest2Socket.emit("track-ready-ack", { sessionId, participantId: guest2Id, isReady: true });
    await sleep(50);
    console.log("✔ Test 6: Track shared, downloaded, SHA-256 integrity verified, and readiness acknowledged");

    // ------------------------------------------------------------------------
    // 7. Synchronized Playback Scheduling (Host request-play)
    // ------------------------------------------------------------------------
    const playCommandPromise = new Promise((resolve) => {
      guest1Socket.once("playback-command", resolve);
    });

    hostSocket.emit("request-play", {
      sessionId,
      hostToken,
      position: 15,
      leadTimeMs: 1000,
    });

    const playCommand = await playCommandPromise;
    assert.strictEqual(playCommand.type, "play");
    assert.strictEqual(playCommand.position, 15);
    assert(playCommand.scheduledAt > Date.now(), "Scheduled time must be in future");
    console.log(`✔ Test 7: Synchronized play command received by guests (Target time: ${playCommand.scheduledAt})`);

    // ------------------------------------------------------------------------
    // 8. MANDATORY MANUAL RESYNC PROTOCOL ("SYNC PLAYBACK")
    // Guest 1 becomes reference device and requests resync
    // ------------------------------------------------------------------------
    console.log("\n  --- Testing Manual Resync Protocol ---");

    const resyncBeginPromiseGuest2 = new Promise((resolve) => {
      guest2Socket.once("resync-begin", resolve);
    });
    const resyncBeginPromiseHost = new Promise((resolve) => {
      hostSocket.once("resync-begin", resolve);
    });

    const resyncCommitPromiseGuest1 = new Promise((resolve) => {
      guest1Socket.once("resync-commit", resolve);
    });
    const resyncCommitPromiseGuest2 = new Promise((resolve) => {
      guest2Socket.once("resync-commit", resolve);
    });

    // Guest 1 presses SYNC PLAYBACK at position 42.5s
    const resyncAck = await new Promise((resolve) => {
      guest1Socket.emit("request-resync", {
        sessionId,
        participantId: guest1Id,
        trackId: trackUploadData.track.id,
        position: 42.5,
        isPlaying: true,
      }, resolve);
    });
    assert(resyncAck.success, "Resync request must be accepted");
    const opId = resyncAck.opId;

    // Both Host and Guest 2 must receive RESYNC_BEGIN immediately
    const beginGuest2 = await resyncBeginPromiseGuest2;
    const beginHost = await resyncBeginPromiseHost;
    assert.strictEqual(beginGuest2.opId, opId);
    assert.strictEqual(beginGuest2.position, 42.5, "Reference position must match Guest 1's position");
    assert.strictEqual(beginGuest2.referenceParticipantId, guest1Id, "Guest 1 must be designated reference device");

    // Devices pause immediately, align position, and acknowledge readiness
    hostSocket.emit("resync-ack", { sessionId, participantId: hostParticipantId, opId, ready: true, position: 42.5 });
    guest2Socket.emit("resync-ack", { sessionId, participantId: guest2Id, opId, ready: true, position: 42.5 });

    // Both devices receive RESYNC_COMMIT with scheduled resume time
    const commitGuest1 = await resyncCommitPromiseGuest1;
    const commitGuest2 = await resyncCommitPromiseGuest2;
    assert.strictEqual(commitGuest1.opId, opId);
    assert.strictEqual(commitGuest2.position, 42.5, "Committed position must match reference device");
    assert.strictEqual(commitGuest1.state, "playing");
    assert(commitGuest1.scheduledResumeAt > Date.now(), "Scheduled resume time must be in future");
    console.log(`✔ Test 8: Manual resync completed successfully. Aligned to Guest 1 at ${commitGuest1.position}s, resuming at ${commitGuest1.scheduledResumeAt}`);

    // ------------------------------------------------------------------------
    // 9. Manual Resync Edge Case: Timeout without locking session
    // ------------------------------------------------------------------------
    console.log("  --- Testing Resync Timeout Recovery ---");
    const timeoutCommitPromise = new Promise((resolve) => {
      hostSocket.once("resync-commit", resolve);
    });

    // Guest 2 requests resync, but Guest 1 refuses to ack
    const resyncTimeoutReq = await new Promise((resolve) => {
      guest2Socket.emit("request-resync", {
        sessionId,
        participantId: guest2Id,
        trackId: trackUploadData.track.id,
        position: 80,
        isPlaying: true,
      }, resolve);
    });
    assert(resyncTimeoutReq.success);

    // Host acks, but Guest 1 does NOT ack
    hostSocket.emit("resync-ack", {
      sessionId,
      participantId: hostParticipantId,
      opId: resyncTimeoutReq.opId,
      ready: true,
      position: 80,
    });

    // Wait for timeout (sessionManager sets 4000ms timeout)
    console.log("  Waiting for resync timeout to trigger automatic commit...");
    const timeoutCommit = await timeoutCommitPromise;
    assert.strictEqual(timeoutCommit.opId, resyncTimeoutReq.opId);
    assert(timeoutCommit.readyParticipants.length >= 2, "Ready participants should be committed");
    console.log("✔ Test 9: Resync timeout recovery succeeded without permanent pause");

    // ------------------------------------------------------------------------
    // 10. Manual Resync Edge Case: Different track rejection
    // ------------------------------------------------------------------------
    const wrongTrackResync = await new Promise((resolve) => {
      guest1Socket.emit("request-resync", {
        sessionId,
        participantId: guest1Id,
        trackId: "wrong-track-id-999",
        position: 10,
      }, resolve);
    });
    assert.strictEqual(wrongTrackResync.success, false, "Resync with mismatched track must be rejected");
    console.log("✔ Test 10: Resync rejected when device has mismatched track");

    // ------------------------------------------------------------------------
    // 11. Host kicks participant
    // ------------------------------------------------------------------------
    const kickPromise = new Promise((resolve) => {
      guest2Socket.once("participant-kicked", resolve);
    });

    const kickRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/participants/${guest2Id}`, {
      method: "DELETE",
      headers: { "x-host-token": hostToken },
    });
    assert.strictEqual(kickRes.status, 200, "Kick request must return 200");
    const kickedEvent = await kickPromise;
    assert.strictEqual(kickedEvent.participantId, guest2Id);
    console.log("✔ Test 11: Host successfully kicked participant");

    // Close sockets
    hostSocket.disconnect();
    guest1Socket.disconnect();
    guest2Socket.disconnect();

    console.log("\n=== ALL SYNCBEAT SERVER & RESYNC PROTOCOL TESTS PASSED ===");
  } finally {
    await syncServer.stop();
    console.log("✔ Test server stopped cleanly");
  }
}

runServerTests().catch((err) => {
  console.error("\n❌ Test suite failed:", err);
  process.exit(1);
});
