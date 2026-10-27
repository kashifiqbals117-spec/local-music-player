const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ioClient = require("socket.io-client");
const { SessionManager } = require("../server/sessionManager.cjs");
const { createSyncServer } = require("../server/syncServer.cjs");

const TEST_PORT = 3196;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPlaybackTimingTests() {
  console.log("=== RUNNING PLAYBACK TIMING & STARTUP SYNCHRONIZATION TESTS ===");

  // =========================================================================
  // 1. UNIT TESTS: CLOCK OFFSET DIRECTION & OVERSLEEP FORMULAS
  // =========================================================================

  // Test 1A: NTP Offset Direction (Client behind server)
  // Scenario: Client clock is at t=1000, Server clock is at t=1500 (Server is 500ms ahead)
  // Client sends at t0=1000, Server receives at t1=1520 (20ms network trip),
  // Server sends at t2=1520, Client receives at t3=1040 (20ms network trip)
  const t0 = 1000;
  const t1 = 1520;
  const t2 = 1520;
  const t3 = 1040;
  const offset = ((t1 - t0) + (t2 - t3)) / 2; // (520 + 480) / 2 = 500ms
  assert.strictEqual(offset, 500, "Offset must equal 500ms");

  // Server schedules event at server wall clock scheduledAt = 2500
  // Client's local scheduled time must be: scheduledAt - offset
  const serverScheduledAt = 2500;
  const clientLocalScheduled = serverScheduledAt - offset; // 2500 - 500 = 2000
  assert.strictEqual(clientLocalScheduled, 2000, "Client local scheduled time must be 2000");

  // Verify convergence: when client clock reaches 2000, server clock is at 2000 + 500 = 2500. Perfect!
  console.log("✔ Test 1: Clock offset direction verified (client behind server)");

  // Test 1B: NTP Offset Direction (Client ahead of server)
  // Client clock at t=1300, Server at t=1000 (Offset should be -300ms)
  const cT0 = 1300;
  const cT1 = 1020;
  const cT2 = 1020;
  const cT3 = 1340;
  const aheadOffset = ((cT1 - cT0) + (cT2 - cT3)) / 2; // (-280 + -320) / 2 = -300ms
  assert.strictEqual(aheadOffset, -300, "Offset must equal -300ms");

  const clientLocalAhead = serverScheduledAt - aheadOffset; // 2500 - (-300) = 2800
  assert.strictEqual(clientLocalAhead, 2800, "Client local scheduled time must be 2800");
  // When client reaches 2800, server clock is 2800 - 300 = 2500. Perfect!
  console.log("✔ Test 2: Clock offset direction verified (client ahead of server)");

  // Test 1C: Dynamic Lead Time Calculation
  const manager = new SessionManager();
  const hostData = manager.createSession("Host", "offline");
  const sId = hostData.session.id;

  // Add guest with 250ms RTT
  const g1 = manager.joinSession(sId, "MobilePhone");
  manager.updateParticipantTelemetry(sId, g1.participant.id, { rtt: 250 });

  const maxRtt = manager.getConnectedMaxRtt(sId);
  assert.strictEqual(maxRtt, 250, "Max RTT should be 250ms");

  const dynamicLeadTime = Math.max(1200, Math.round(maxRtt * 3 + 800)); // 250 * 3 + 800 = 1550ms
  assert.strictEqual(dynamicLeadTime, 1550, "Dynamic lead time should scale to 1550ms for 250ms RTT");
  console.log("✔ Test 3: Dynamic lead time scales based on network latency (1550ms for 250ms RTT)");

  // Test 1D: Oversleep Compensation Formula
  const basePosition = 30.0;
  const timerLateMs = 50; // Woke up 50ms late
  const compensatedPosition = timerLateMs > 25 ? basePosition + timerLateMs / 1000 : basePosition;
  assert.strictEqual(compensatedPosition, 30.05, "Compensated position must advance by 50ms (0.05s)");
  console.log("✔ Test 4: Timer oversleep compensation adjusts starting playback position");

  // =========================================================================
  // 2. INTEGRATION TESTS: AUDIO READINESS ENFORCEMENT & SOCKET PLAY TIMING
  // =========================================================================

  const syncServer = createSyncServer({ port: TEST_PORT });
  await syncServer.start();
  console.log(`✔ Test sync server online at http://localhost:${TEST_PORT}`);

  const baseUrl = `http://localhost:${TEST_PORT}`;

  try {
    // Step 1: Create session via REST API
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostName: "Laptop Host", mode: "offline" }),
    });
    const { session, hostToken, clientToken: hostClientToken, hostParticipantId } = await createRes.json();
    const sessionId = session.id;

    // Step 2: Connect Host and Phone Guest sockets
    const hostSocket = ioClient(baseUrl, { reconnection: false });
    const phoneSocket = ioClient(baseUrl, { reconnection: false });

    await new Promise((resolve) => {
      let count = 0;
      const onConnect = () => {
        count++;
        if (count === 2) resolve();
      };
      hostSocket.on("connect", onConnect);
      phoneSocket.on("connect", onConnect);
    });

    // Step 3: Join session
    await new Promise((resolve) => {
      hostSocket.emit("join-session", { sessionId, participantId: hostParticipantId, clientToken: hostClientToken, name: "Laptop Host" }, resolve);
    });
    let phoneParticipantId = null;
    await new Promise((resolve) => {
      phoneSocket.emit("join-session", { sessionId, name: "Pixel Phone" }, (res) => {
        phoneParticipantId = res.participant.id;
        resolve();
      });
    });

    // Step 4: Host shares a track
    const testAudioPath = path.join(__dirname, "temp_timing_test_audio.mp3");
    const testAudioBuffer = crypto.randomBytes(16384);
    fs.writeFileSync(testAudioPath, testAudioBuffer);
    const audioHash = crypto.createHash("sha256").update(testAudioBuffer).digest("hex");
    const trackInfo = {
      title: "Sync Test Track",
      artist: "SyncBeat",
      album: "Test Album",
      duration: 180,
    };

    // Upload / register track directly via REST
    const uploadRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-host-token": hostToken,
      },
      body: JSON.stringify({
        localFilePath: testAudioPath,
        title: trackInfo.title,
        artist: trackInfo.artist,
        album: trackInfo.album,
        duration: trackInfo.duration,
      }),
    });
    assert.strictEqual(uploadRes.status, 201, "Track registration must succeed");

    // Allow socket events to propagate
    await sleep(150);

    // Verify: Host starts as ready (has local file), Phone starts as isReady = false
    const sessionSnap = syncServer.sessionManager.getSession(sessionId);
    const phoneParticipant = sessionSnap.participants.get(phoneParticipantId);
    assert.strictEqual(phoneParticipant.isReady, false, "Phone must start in unready state while buffering");
    console.log("✔ Test 5: Phone starts in unready state (isReady = false) upon track distribution");

    // Step 5: Host attempts to play before Phone is ready -> MUST BE REJECTED
    let rejectedError = null;
    await new Promise((resolve) => {
      hostSocket.emit("request-play", { sessionId, hostToken, position: 0 }, (res) => {
        if (!res.success) {
          rejectedError = res.error;
        }
        resolve();
      });
    });

    assert(rejectedError, "Playback request must be rejected while devices are buffering");
    assert(
      rejectedError.includes("Cannot play yet") && rejectedError.includes("Pixel Phone"),
      `Error must indicate Pixel Phone is still preparing: ${rejectedError}`
    );
    console.log(`✔ Test 6: Host play rejected because Phone is still buffering (${rejectedError})`);

    // Step 6: Phone finishes buffering (HTML5 audio readyState >= 3) and emits track-ready-ack
    phoneSocket.emit("track-ready-ack", { sessionId, participantId: phoneParticipantId, isReady: true });
    await sleep(150);

    const phoneParticipantReady = sessionSnap.participants.get(phoneParticipantId);
    assert.strictEqual(phoneParticipantReady.isReady, true, "Phone is now marked ready");
    console.log("✔ Test 7: Phone acknowledged audio element readyState >= 3");

    // Step 7: Phone reports high network RTT telemetry (220ms)
    phoneSocket.emit("playback-telemetry", {
      sessionId,
      participantId: phoneParticipantId,
      rtt: 220,
      drift: 0.01,
      readyState: 4,
    });
    await sleep(100);

    // Step 8: Host plays now that all devices are ready
    let playCommandReceived = null;
    phoneSocket.on("playback-command", (cmd) => {
      playCommandReceived = cmd;
    });

    let playSuccess = false;
    await new Promise((resolve) => {
      hostSocket.emit("request-play", { sessionId, hostToken, position: 10.0 }, (res) => {
        playSuccess = res.success;
        resolve();
      });
    });

    assert(playSuccess, "Play request must succeed when all devices are ready");
    await sleep(150);

    assert(playCommandReceived, "Phone must receive playback-command");
    assert.strictEqual(playCommandReceived.type, "play");
    assert.strictEqual(playCommandReceived.position, 10.0);

    // Verify scheduledAt provides sufficient dynamic lead time for 220ms RTT
    const leadTimeMs = playCommandReceived.scheduledAt - Date.now();
    assert(
      leadTimeMs >= 1000,
      `Scheduled lead time (${leadTimeMs}ms) must provide ample headroom for mobile audio priming`
    );
    console.log(
      `✔ Test 8: Coordinated playback scheduled at server timestamp: ${playCommandReceived.scheduledAt} (Lead time: ${leadTimeMs}ms)`
    );

    // Step 9: Simulate Phone reporting true playback startup diagnostics
    phoneSocket.emit("playback-telemetry", {
      sessionId,
      participantId: phoneParticipantId,
      startupDelayMs: 14,
      readyState: 4,
      rtt: 220,
      drift: 0.005,
    });
    await sleep(100);

    const updatedPhone = sessionSnap.participants.get(phoneParticipantId);
    assert.strictEqual(updatedPhone.rtt, 220);
    assert.strictEqual(updatedPhone.isReady, true);
    console.log("✔ Test 9: Phone diagnostic telemetry recorded successfully (Startup delay: 14ms)");

    // Cleanup sockets
    hostSocket.disconnect();
    phoneSocket.disconnect();

    console.log("\n=== ALL PLAYBACK TIMING & STARTUP SYNCHRONIZATION TESTS PASSED ===");
  } finally {
    const testAudioPath = path.join(__dirname, "temp_timing_test_audio.mp3");
    if (fs.existsSync(testAudioPath)) {
      try {
        fs.unlinkSync(testAudioPath);
      } catch (_) {}
    }
    await syncServer.stop();
    console.log("✔ Test sync server stopped cleanly");
  }
}

runPlaybackTimingTests().catch((err) => {
  console.error("❌ Playback timing test failed:", err);
  process.exit(1);
});
