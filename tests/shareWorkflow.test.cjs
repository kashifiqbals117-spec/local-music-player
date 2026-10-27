const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const ioClient = require("socket.io-client");
const { createSyncServer, computeFileSha256 } = require("../server/syncServer.cjs");

const TEST_PORT = 3197;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runShareWorkflowTests() {
  console.log("=== RUNNING SYNCBEAT SONG SHARING WORKFLOW INTEGRATION TESTS ===");

  const server = createSyncServer({ port: TEST_PORT });
  await server.start();
  const baseUrl = `http://localhost:${TEST_PORT}`;
  console.log(`✔ Test sync server online at ${baseUrl}`);

  let testAudioPath = null;

  try {
    // 1. Create a mock audio file on disk representing a local music library song
    const tempDir = os.tmpdir();
    testAudioPath = path.join(tempDir, `syncbeat-test-track-${Date.now()}.mp3`);
    const dummyAudioContent = Buffer.from(
      "ID3\x03\x00\x00\x00\x00\x00\x0a" + "SYNCBEAT_TEST_AUDIO_STREAM_BINARY_DATA_" + crypto.randomBytes(1024 * 32).toString("hex")
    );
    fs.writeFileSync(testAudioPath, dummyAudioContent);
    const expectedHash = await computeFileSha256(testAudioPath);
    console.log(`✔ Created temporary test audio file (${dummyAudioContent.length} bytes, SHA-256: ${expectedHash})`);

    // 2. Create an offline session as Host
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostName: "Desktop Laptop (Host)", mode: "offline" }),
    });
    assert.strictEqual(createRes.status, 201);
    const { session, hostToken, clientToken, hostParticipantId } = await createRes.json();
    const sessionId = session.id;
    console.log(`✔ Step 1: Session ${sessionId} created by Host`);

    // 3. Connect Host and Simulated Guest (Phone) sockets
    const hostSocket = ioClient(baseUrl, { reconnection: false });
    const guestSocket = ioClient(baseUrl, { reconnection: false });

    await new Promise((resolve) => {
      hostSocket.emit("join-session", {
        sessionId,
        name: "Desktop Laptop (Host)",
        participantId: hostParticipantId,
        clientToken,
      }, resolve);
    });

    const guestJoin = await new Promise((resolve) => {
      guestSocket.emit("join-session", {
        sessionId,
        name: "Friend Phone (Guest)",
      }, resolve);
    });
    assert(guestJoin.success, "Guest phone must join successfully");
    const guestParticipantId = guestJoin.participant.id;
    console.log(`✔ Step 2: Host and Guest connected to session (Guest ID: ${guestParticipantId})`);

    // 4. Setup listeners on Guest for track-published and session-updated
    let guestReceivedTrack = null;
    let guestDownloadUrl = null;
    const trackPublishedPromise = new Promise((resolve) => {
      guestSocket.on("track-published", (data) => {
        guestReceivedTrack = data.track;
        guestDownloadUrl = data.downloadUrl;
        resolve(data);
      });
    });

    // 5. Host invokes sharing of the selected song
    console.log("✔ Step 3: Host shares song from local library...");
    const shareRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-host-token": hostToken,
      },
      body: JSON.stringify({
        localFilePath: testAudioPath,
        title: "Neon Horizon",
        artist: "Synthwave Collective",
        album: "Retrowave City",
        duration: 215,
      }),
    });

    assert.strictEqual(shareRes.status, 201, "Server must accept song registration");
    const shareData = await shareRes.json();
    assert.strictEqual(shareData.success, true);
    assert.strictEqual(shareData.track.title, "Neon Horizon");
    assert.strictEqual(shareData.track.hash, expectedHash, "Server track hash must match local file SHA-256");
    console.log(`✔ Step 4: Song "${shareData.track.title}" registered with session`);

    // 6. Verify Guest received track-published broadcast
    await trackPublishedPromise;
    assert.ok(guestReceivedTrack, "Guest must receive track-published event");
    assert.strictEqual(guestReceivedTrack.title, "Neon Horizon");
    assert.strictEqual(guestReceivedTrack.hash, expectedHash);
    console.log(`✔ Step 5: Guest received track-published event for "${guestReceivedTrack.title}"`);

    // 7. Guest downloads the track via HTTP Range-compatible endpoint
    const fullDownloadUrl = `${baseUrl}${guestDownloadUrl}`;
    const downloadRes = await fetch(fullDownloadUrl);
    assert.strictEqual(downloadRes.status, 200, "Download URL must return HTTP 200");
    const downloadedBuffer = Buffer.from(await downloadRes.arrayBuffer());
    assert.strictEqual(downloadedBuffer.length, dummyAudioContent.length, "Downloaded byte size must match original file");

    // 8. Guest verifies SHA-256 integrity
    const guestComputedHash = crypto.createHash("sha256").update(downloadedBuffer).digest("hex");
    assert.strictEqual(guestComputedHash, expectedHash, "Guest verified SHA-256 matches server hash");
    console.log("✔ Step 6: Guest downloaded audio stream and verified SHA-256 integrity");

    // 9. Guest reports readiness to server
    guestSocket.emit("track-ready-ack", {
      sessionId,
      participantId: guestParticipantId,
      isReady: true,
    });

    // Host also marks ready
    hostSocket.emit("track-ready-ack", {
      sessionId,
      participantId: hostParticipantId,
      isReady: true,
    });

    await sleep(150);

    // 10. Verify both devices are marked ready in session state
    const sessionCheckRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
    const sessionState = await sessionCheckRes.json();
    assert.strictEqual(sessionState.currentTrack.title, "Neon Horizon");
    const hostPart = sessionState.participants.find((p) => p.id === hostParticipantId);
    const guestPart = sessionState.participants.find((p) => p.id === guestParticipantId);
    assert.strictEqual(hostPart.isReady, true, "Host must be marked ready");
    assert.strictEqual(guestPart.isReady, true, "Guest must be marked ready");
    console.log("✔ Step 7: Server recorded both Host and Guest as 🟢 Ready");

    // 11. Coordinated Playback: Host triggers play command
    let guestPlayReceived = null;
    const playPromise = new Promise((resolve) => {
      guestSocket.on("playback-command", (cmd) => {
        if (cmd.type === "play") {
          guestPlayReceived = cmd;
          resolve(cmd);
        }
      });
    });

    hostSocket.emit("request-play", {
      sessionId,
      hostToken,
      position: 0,
      leadTimeMs: 800,
    });

    const playCmd = await playPromise;
    assert.strictEqual(playCmd.type, "play");
    assert(playCmd.scheduledAt > Date.now(), "Scheduled play timestamp must be in the future");
    console.log(`✔ Step 8: Coordinated playback command received! Scheduled play at timestamp: ${playCmd.scheduledAt}`);

    // 12. Negative test: Unauthorized participant cannot share tracks
    const unauthorizedShareRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-host-token": "invalid_fake_token_12345",
      },
      body: JSON.stringify({
        localFilePath: testAudioPath,
        title: "Hack Attempt",
      }),
    });
    assert.strictEqual(unauthorizedShareRes.status, 403, "Unauthorized share attempt must be rejected with 403");
    console.log("✔ Step 9: Unauthorized track share correctly rejected by server (403 Forbidden)");

    // 13. Negative test: Non-existent file path rejected
    const nonExistentShareRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-host-token": hostToken,
      },
      body: JSON.stringify({
        localFilePath: "C:\\non_existent_folder\\fake_file.mp3",
        title: "Missing File",
      }),
    });
    assert.strictEqual(nonExistentShareRes.status, 400, "Non-existent file path must be rejected with 400");
    console.log("✔ Step 10: Non-existent file share attempt cleanly rejected (400 Bad Request)");

    // Clean disconnect
    hostSocket.disconnect();
    guestSocket.disconnect();

    console.log("\n=== ALL SONG SHARING WORKFLOW TESTS PASSED SUCCESSFULLY ===");
  } finally {
    if (testAudioPath && fs.existsSync(testAudioPath)) {
      try {
        fs.unlinkSync(testAudioPath);
      } catch (e) {}
    }
    await server.stop();
  }
}

runShareWorkflowTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
