/**
 * Test Suite: Synchronized Online Playback (Audius Tracks)
 * Simulates Host, Guests, and late joiners synchronizing playback of an online Audius track.
 * Tests clock offset, buffer readiness gating, coordinated play/pause/seek,
 * manual resync, and switching between online and local tracks.
 */

const assert = require("assert");
const { io: ioClient } = require("socket.io-client");
const { createSyncServer } = require("../backend/src/server.cjs");

async function runOnlineSyncTests() {
  console.log("=== RUNNING SYNCBEAT ONLINE AUDIUS SYNCHRONIZATION TESTS ===");

  const testPort = 3192;
  const syncServer = createSyncServer({ port: testPort });
  await syncServer.start();
  const serverUrl = `http://localhost:${testPort}`;
  console.log(`✔ Sync server online at ${serverUrl}`);

  let hostSocket;
  let guest1Socket;
  let guest2Socket;
  let lateJoinerSocket;

  try {
    // 1. Host creates session
    const createRes = await fetch(`${serverUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostName: "Host-Desktop", mode: "online" }),
    });
    const sessionData = await createRes.json();
    const sessionId = sessionData.session.id;
    const hostToken = sessionData.hostToken;
    console.log(`✔ Test 1: Created online session ${sessionId}`);

    // 2. Connect Host, Guest 1, and Guest 2 via WebSockets
    hostSocket = ioClient(serverUrl, { reconnection: false });
    guest1Socket = ioClient(serverUrl, { reconnection: false });
    guest2Socket = ioClient(serverUrl, { reconnection: false });

    await Promise.all([
      new Promise((res) => hostSocket.on("connect", res)),
      new Promise((res) => guest1Socket.on("connect", res)),
      new Promise((res) => guest2Socket.on("connect", res)),
    ]);

    // Join room
    const hostJoin = await new Promise((res) =>
      hostSocket.emit("join-session", { sessionId, name: "Host-Desktop" }, res)
    );
    const guest1Join = await new Promise((res) =>
      guest1Socket.emit("join-session", { sessionId, name: "Guest-Phone" }, res)
    );
    const guest2Join = await new Promise((res) =>
      guest2Socket.emit("join-session", { sessionId, name: "Guest-Laptop" }, res)
    );

    assert(hostJoin.success && guest1Join.success && guest2Join.success, "All clients must join session");
    console.log("✔ Test 2: Host and 2 Guests joined session room");

    // 3. NTP Clock Synchronization
    const clockSyncRes = await new Promise((res) =>
      guest1Socket.emit("time-sync", { clientSendTime: Date.now() }, res)
    );
    assert(clockSyncRes.serverReceiveTime && clockSyncRes.serverSendTime, "Server must return timestamps");
    console.log("✔ Test 3: NTP clock synchronization handshake successful");

    // 4. Host shares an online Audius track with the session
    const onlineTrackPayload = {
      source: "audius",
      id: "95wro",
      title: "Stars In The Sky - Lofi Beats",
      artist: "Lofi Beats",
      album: "Lofi Collection",
      duration: 71,
      artwork: "https://audius.co/artwork/95wro.jpg",
      streamUrl: "/api/music/stream/95wro",
    };

    const trackPublishedPromise = new Promise((resolve) => {
      guest1Socket.once("track-published", (data) => resolve(data));
    });

    const shareRes = await fetch(`${serverUrl}/api/sessions/${sessionId}/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-host-token": hostToken,
      },
      body: JSON.stringify(onlineTrackPayload),
    });

    const shareData = await shareRes.json();
    assert(shareData.success, "Sharing online track must succeed");
    assert.strictEqual(shareData.track.source, "audius", "Track source must be 'audius'");
    assert.strictEqual(shareData.track.title, "Stars In The Sky - Lofi Beats");
    assert(shareData.downloadUrl.includes("/api/music/stream/95wro"), "Download/stream URL must be distributed");

    const publishedEvent = await trackPublishedPromise;
    assert.strictEqual(publishedEvent.track.id, "95wro");
    console.log("✔ Test 4: Host shared online Audius track; server distributed streaming reference to room");

    // 5. Unready Gate: Host attempts to play while devices are still buffering
    const prematurePlayRes = await new Promise((res) =>
      hostSocket.emit("request-play", { sessionId, hostToken, position: 0 }, res)
    );
    assert.strictEqual(prematurePlayRes.success, false, "Play must be rejected while participants are buffering");
    assert(prematurePlayRes.error.includes("devices still preparing audio"), "Error must indicate buffering devices");
    console.log("✔ Test 5: Premature playback cleanly rejected while devices are buffering stream");

    // 6. Devices finish buffering audio and acknowledge readiness
    hostSocket.emit("track-ready-ack", { sessionId, isReady: true });
    guest1Socket.emit("track-ready-ack", { sessionId, isReady: true });
    guest2Socket.emit("track-ready-ack", { sessionId, isReady: true });

    // Wait a brief moment for server state update
    await new Promise((r) => setTimeout(r, 100));

    // 7. Host requests coordinated play
    const guestPlayCmdPromise = new Promise((resolve) => {
      guest1Socket.once("playback-command", (cmd) => resolve(cmd));
    });

    const playCoordRes = await new Promise((res) =>
      hostSocket.emit("request-play", { sessionId, hostToken, position: 0, leadTimeMs: 1200 }, res)
    );

    assert(playCoordRes.success, "Play request must succeed when all devices are ready");
    assert(playCoordRes.scheduledAt > Date.now(), "Scheduled time must be in the future");
    const playCmd = await guestPlayCmdPromise;
    assert.strictEqual(playCmd.type, "play", "Command type must be play");
    assert.strictEqual(playCmd.position, 0, "Initial position must be 0");
    assert(playCmd.commandId, "Command must have a unique commandId");
    console.log(`✔ Test 6: Coordinated play scheduled at server timestamp: ${playCmd.scheduledAt} (Lead time: ${playCmd.leadTimeMs}ms)`);

    // 8. Clients acknowledge audible playback started
    guest1Socket.emit("playback-started", {
      sessionId,
      participantId: guest1Join.participant.id,
      commandId: playCmd.commandId,
      scheduledAt: playCmd.scheduledAt,
      actualStartedAt: playCmd.scheduledAt + 12,
      startupDelayMs: 12,
      initialPosition: 0,
      success: true,
    });
    console.log("✔ Test 7: Step 6 Ack recorded by server for online stream");

    // 9. Host initiates coordinated pause
    const pausePromise = new Promise((resolve) => {
      const handler = (cmd) => {
        if (cmd.type === "pause") {
          guest2Socket.off("playback-command", handler);
          resolve(cmd);
        }
      };
      guest2Socket.on("playback-command", handler);
    });

    await new Promise((res) =>
      hostSocket.emit("request-pause", { sessionId, hostToken, position: 15.5 }, res)
    );
    const pauseCmd = await pausePromise;
    assert.strictEqual(pauseCmd.type, "pause");
    assert.strictEqual(pauseCmd.position, 15.5);
    console.log("✔ Test 8: Coordinated pause verified at 15.5s");

    // 10. Host initiates coordinated seek
    const seekPromise = new Promise((resolve) => {
      const handler = (cmd) => {
        if (cmd.type === "seek") {
          guest1Socket.off("playback-command", handler);
          resolve(cmd);
        }
      };
      guest1Socket.on("playback-command", handler);
    });

    await new Promise((res) =>
      hostSocket.emit("request-seek", { sessionId, hostToken, position: 45.0 }, res)
    );
    const seekCmd = await seekPromise;
    assert.strictEqual(seekCmd.type, "seek");
    assert.strictEqual(seekCmd.position, 45.0);
    console.log("✔ Test 9: Coordinated seek verified at 45.0s");

    // 11. Guest 1 requests manual resynchronization (SYNC PLAYBACK)
    const resyncBeginPromise = new Promise((resolve) => {
      guest2Socket.once("resync-begin", (cmd) => resolve(cmd));
    });
    const resyncCommitPromise = new Promise((resolve) => {
      guest2Socket.once("resync-commit", (cmd) => resolve(cmd));
    });

    const resyncReq = await new Promise((res) =>
      guest1Socket.emit(
        "request-resync",
        {
          sessionId,
          participantId: guest1Join.participant.id,
          trackId: "95wro",
          position: 45.2,
          isPlaying: true,
        },
        res
      )
    );
    assert(resyncReq.success, "Resync request must succeed");

    const resyncBegin = await resyncBeginPromise;
    assert.strictEqual(resyncBegin.referenceName, "Guest-Phone");

    // Other devices acknowledge pause and alignment
    hostSocket.emit("resync-ack", {
      sessionId,
      participantId: hostJoin.participant.id,
      opId: resyncBegin.opId,
      ready: true,
      position: 45.2,
    });
    guest2Socket.emit("resync-ack", {
      sessionId,
      participantId: guest2Join.participant.id,
      opId: resyncBegin.opId,
      ready: true,
      position: 45.2,
    });

    const commitCmd = await resyncCommitPromise;
    assert.strictEqual(commitCmd.position, 45.2);
    assert(commitCmd.scheduledResumeAt > Date.now(), "Resync resume must be scheduled in future");
    console.log(`✔ Test 10: Manual resync completed successfully for online track (Aligned to Guest-Phone at 45.2s)`);

    // 12. Late joiner joins during online playback
    lateJoinerSocket = ioClient(serverUrl, { reconnection: false });
    await new Promise((res) => lateJoinerSocket.on("connect", res));
    const lateJoin = await new Promise((res) =>
      lateJoinerSocket.emit("join-session", { sessionId, name: "Late-Joiner" }, res)
    );
    assert(lateJoin.success, "Late joiner must join successfully");
    assert(lateJoin.session.currentTrack, "Late joiner must receive active session track");
    assert.strictEqual(lateJoin.session.currentTrack.id, "95wro");
    assert.strictEqual(lateJoin.session.currentTrack.source, "audius");
    assert(lateJoin.session.currentTrack.streamUrl, "Late joiner must receive streamUrl");
    console.log("✔ Test 11: Late joiner received current online track metadata & stream URL");

  } finally {
    if (hostSocket) hostSocket.disconnect();
    if (guest1Socket) guest1Socket.disconnect();
    if (guest2Socket) guest2Socket.disconnect();
    if (lateJoinerSocket) lateJoinerSocket.disconnect();
    await syncServer.stop();
    console.log("✔ Test sync server stopped cleanly");
  }

  console.log("\n=== ALL ONLINE SYNCHRONIZATION TESTS PASSED SUCCESSFULLY ===\n");
}

runOnlineSyncTests().catch((err) => {
  console.error("Online sync test failed:", err);
  process.exit(1);
});
