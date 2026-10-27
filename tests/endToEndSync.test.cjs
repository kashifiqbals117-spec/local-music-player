const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ioClient = require("socket.io-client");
const { createSyncServer, computeFileSha256 } = require("../server/syncServer.cjs");

const E2E_PORT = 3198;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runEndToEndTest() {
  console.log("=== RUNNING SYNCBEAT END-TO-END SIMULATED GUEST & HOST TEST ===");

  const server = createSyncServer({ port: E2E_PORT });
  await server.start();
  const baseUrl = `http://localhost:${E2E_PORT}`;
  console.log(`✔ Server online at ${baseUrl}`);

  try {
    // 1. Verify Static Frontend Asset Serving
    const indexRes = await fetch(`${baseUrl}/?session=TEST99`);
    assert.strictEqual(indexRes.status, 200, "Frontend SPA root must be served");
    const indexHtml = await indexRes.text();
    assert(indexHtml.includes("<html") || indexHtml.includes("SyncBeat"), "Must serve HTML document");
    console.log("✔ E2E Step 1: Frontend SPA served successfully for mobile/desktop browsers");

    // 2. Host creates an offline session
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostName: "Host Mac/PC", mode: "offline" }),
    });
    assert.strictEqual(createRes.status, 201);
    const { session, hostToken, clientToken, hostParticipantId } = await createRes.json();
    const sessionId = session.id;
    console.log(`✔ E2E Step 2: Session ${sessionId} created by Host`);

    // 3. Connect Host and Simulated Mobile Phone Guest
    const hostSocket = ioClient(baseUrl, { reconnection: false });
    const phoneSocket = ioClient(baseUrl, { reconnection: false });

    await new Promise((resolve) => {
      hostSocket.emit("join-session", {
        sessionId,
        name: "Host Mac/PC",
        participantId: hostParticipantId,
        clientToken,
      }, resolve);
    });

    const phoneJoin = await new Promise((resolve) => {
      phoneSocket.emit("join-session", {
        sessionId,
        name: "User Android Phone",
      }, resolve);
    });
    assert(phoneJoin.success, "Phone guest must join successfully");
    const phoneParticipantId = phoneJoin.participant.id;
    console.log(`✔ E2E Step 3: Mobile Phone joined session (Participant ID: ${phoneParticipantId})`);

    // 4. Mobile Phone Performs Clock Synchronization
    const phoneClockT0 = Date.now();
    const phoneSync = await new Promise((resolve) => {
      phoneSocket.emit("time-sync", { clientSendTime: phoneClockT0 }, resolve);
    });
    const phoneClockT3 = Date.now();
    const clockOffset = ((phoneSync.serverReceiveTime - phoneClockT0) + (phoneSync.serverSendTime - phoneClockT3)) / 2;
    console.log(`✔ E2E Step 4: Phone synchronized clock with server (Offset: ${clockOffset.toFixed(1)}ms)`);

    // 5. Host Shares Local Track -> Phone Receives and Verifies SHA-256
    const testAudioPath = path.resolve(__dirname, "../public/test.mp3");
    const expectedHash = await computeFileSha256(testAudioPath);

    const phoneTrackPromise = new Promise((resolve) => {
      phoneSocket.once("track-published", resolve);
    });

    const shareRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-host-token": hostToken,
      },
      body: JSON.stringify({
        localFilePath: testAudioPath,
        title: "Test Track Friends",
        artist: "Chase Atlantic",
        duration: 236.3,
      }),
    });
    assert.strictEqual(shareRes.status, 201);

    const publishedTrackData = await phoneTrackPromise;
    assert.strictEqual(publishedTrackData.track.hash, expectedHash);

    // Phone downloads audio file stream
    const audioRes = await fetch(`${baseUrl}${publishedTrackData.downloadUrl}`);
    assert.strictEqual(audioRes.status, 200);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    const phoneCalculatedHash = crypto.createHash("sha256").update(audioBuffer).digest("hex");
    assert.strictEqual(phoneCalculatedHash, expectedHash, "Phone SHA-256 checksum matches expected");

    // Phone sends track-ready-ack
    phoneSocket.emit("track-ready-ack", { sessionId, participantId: phoneParticipantId, isReady: true });
    await sleep(50);
    console.log("✔ E2E Step 5: Audio stream transferred, verified with SHA-256, and marked ready on phone");

    // 6. Host Starts Coordinated Playback
    const phonePlayPromise = new Promise((resolve) => {
      phoneSocket.once("playback-command", resolve);
    });

    hostSocket.emit("request-play", {
      sessionId,
      hostToken,
      position: 0,
      leadTimeMs: 1200,
    });

    const playCmd = await phonePlayPromise;
    assert.strictEqual(playCmd.type, "play");
    assert(playCmd.scheduledAt > Date.now(), "Play command is scheduled in future for exact sync");
    console.log(`✔ E2E Step 6: Coordinated play scheduled at server timestamp: ${playCmd.scheduledAt}`);

    // 7. Phone Notices Drift / Out of Sync -> Presses "SYNC PLAYBACK"
    console.log("\n  --- Simulating Phone pressing SYNC PLAYBACK ---");
    const hostResyncBeginPromise = new Promise((resolve) => {
      hostSocket.once("resync-begin", resolve);
    });
    const phoneResyncCommitPromise = new Promise((resolve) => {
      phoneSocket.once("resync-commit", resolve);
    });

    // Phone sends request-resync at position 35.8s
    const resyncInit = await new Promise((resolve) => {
      phoneSocket.emit("request-resync", {
        sessionId,
        participantId: phoneParticipantId,
        trackId: publishedTrackData.track.id,
        position: 35.8,
        isPlaying: true,
      }, resolve);
    });
    assert(resyncInit.success, "Resync request from phone accepted");

    // Host receives RESYNC_BEGIN with phone as reference
    const hostBegin = await hostResyncBeginPromise;
    assert.strictEqual(hostBegin.referenceParticipantId, phoneParticipantId, "Phone is designated reference device");
    assert.strictEqual(hostBegin.position, 35.8);

    // Host acknowledges pause and alignment
    hostSocket.emit("resync-ack", {
      sessionId,
      participantId: hostParticipantId,
      opId: resyncInit.opId,
      ready: true,
      position: 35.8,
    });

    // Both devices receive RESYNC_COMMIT
    const phoneCommit = await phoneResyncCommitPromise;
    assert.strictEqual(phoneCommit.opId, resyncInit.opId);
    assert.strictEqual(phoneCommit.position, 35.8, "All devices aligned to phone's 35.8s mark");
    assert.strictEqual(phoneCommit.state, "playing");
    assert(phoneCommit.scheduledResumeAt > Date.now());
    console.log(`✔ E2E Step 7: Manual resync completed! Both devices aligned to Phone at 35.8s, scheduled to resume at ${phoneCommit.scheduledResumeAt}`);

    // Clean disconnect
    hostSocket.disconnect();
    phoneSocket.disconnect();

    console.log("\n=== END-TO-END TEST SUITE PASSED SUCCESSFULLY ===\n");
  } finally {
    await server.stop();
  }
}

runEndToEndTest().catch((err) => {
  console.error("E2E test failed:", err);
  process.exit(1);
});
