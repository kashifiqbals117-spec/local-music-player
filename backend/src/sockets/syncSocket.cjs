/**
 * Socket.IO Synchronization Event Handlers for SyncBeat.
 * Handles room joining, NTP time sync, playback commands, telemetry, and manual resync.
 */

function setupSyncSocket({ io, sessionManager, resyncTimers = new Map() }) {
  io.on("connection", (socket) => {
    let currentSessionId = null;
    let currentParticipantId = null;

    // Join Session
    socket.on("join-session", ({ sessionId, name, participantId, clientToken }, callback) => {
      if (!sessionId) {
        return callback && callback({ success: false, error: "Session ID is required." });
      }

      const cleanSessionId = sessionId.toUpperCase().trim();
      const result = sessionManager.joinSession(cleanSessionId, {
        name,
        socketId: socket.id,
        participantId,
        clientToken,
      });

      if (!result.success) {
        return callback && callback(result);
      }

      currentSessionId = cleanSessionId;
      currentParticipantId = result.participant.id;
      const room = `session_${cleanSessionId}`;
      socket.join(room);

      const publicState = sessionManager.getPublicState(cleanSessionId);

      // Reply to joiner
      if (callback) {
        callback({
          success: true,
          participant: result.participant,
          clientToken: result.clientToken,
          isReconnect: result.isReconnect,
          session: publicState,
        });
      }

      // Broadcast update to all room members
      io.to(room).emit("session-updated", publicState);
      io.to(room).emit("participant-joined", { participant: result.participant });
    });

    // Clock Synchronization (NTP-style)
    socket.on("time-sync", (clientData, callback) => {
      const serverReceiveTime = Date.now();
      const clientSendTime = typeof clientData === "number" ? clientData : clientData?.clientSendTime;

      const response = {
        clientSendTime,
        serverReceiveTime,
        serverSendTime: Date.now(),
      };

      if (callback) callback(response);
      else socket.emit("time-sync-response", response);
    });

    // Participant reports track is downloaded and verified ready
    socket.on("track-ready-ack", ({ sessionId, participantId, isReady, ready }) => {
      const targetSession = sessionId || currentSessionId;
      const targetParticipant = participantId || currentParticipantId;

      if (!targetSession || !targetParticipant) return;

      const readyState =
        isReady !== undefined ? Boolean(isReady) : ready !== undefined ? Boolean(ready) : true;
      sessionManager.setParticipantReady(targetSession, targetParticipant, readyState);
      io.to(`session_${targetSession}`).emit(
        "session-updated",
        sessionManager.getPublicState(targetSession)
      );
    });

    // Playback control: Play (Host authoritative or Resync commit)
    socket.on("request-play", ({ sessionId, hostToken, position, leadTimeMs = 1200 }, callback) => {
      const targetSession = sessionId || currentSessionId;
      if (!sessionManager.isHostAuthorized(targetSession, hostToken)) {
        return callback && callback({ success: false, error: "Unauthorized: host privileges required." });
      }

      const session = sessionManager.getSession(targetSession);
      if (!session) {
        return callback && callback({ success: false, error: "Session not found." });
      }

      // Ensure every connected participating device has verified and pre-buffered the track
      const unready = Array.from(session.participants.values()).filter((p) => p.connected && !p.isReady);
      if (unready.length > 0) {
        const names = unready.map((p) => p.name).join(", ");
        return (
          callback &&
          callback({
            success: false,
            error: `Cannot play yet: devices still preparing audio (${names}). Please wait a moment.`,
            unreadyNames: unready.map((p) => p.name),
          })
        );
      }

      // Schedule playback sufficiently far into the future based on measured network latency
      const maxRtt = sessionManager.getConnectedMaxRtt(targetSession);
      const dynamicLeadTime = Math.max(1200, Math.round(maxRtt * 3 + 800));
      const effectiveLeadTime = Math.max(dynamicLeadTime, Number(leadTimeMs) || 1200);

      const scheduledAt = Date.now() + effectiveLeadTime;
      const playResult = sessionManager.setPlayback(targetSession, hostToken, {
        state: "playing",
        position,
        scheduledAt,
      });

      if (!playResult.success) {
        return callback && callback(playResult);
      }

      console.log(
        `[SyncBeat Timing Server] Play coordinated for session ${targetSession} (commandId: ${playResult.playback.commandId}, scheduledAt: ${scheduledAt}, leadTime: ${effectiveLeadTime}ms, pos: ${playResult.playback.position}s)`
      );

      io.to(`session_${targetSession}`).emit("playback-command", {
        type: "play",
        position: playResult.playback.position,
        scheduledAt,
        leadTimeMs: effectiveLeadTime,
        revision: playResult.playback.revision,
        commandId: playResult.playback.commandId,
      });

      io.to(`session_${targetSession}`).emit(
        "session-updated",
        sessionManager.getPublicState(targetSession)
      );
      if (callback) {
        callback({
          success: true,
          playback: playResult.playback,
          scheduledAt,
          leadTimeMs: effectiveLeadTime,
        });
      }
    });

    // Playback control: Pause (Host authoritative)
    socket.on("request-pause", ({ sessionId, hostToken, position }, callback) => {
      const targetSession = sessionId || currentSessionId;
      if (!sessionManager.isHostAuthorized(targetSession, hostToken)) {
        return callback && callback({ success: false, error: "Unauthorized: host privileges required." });
      }

      const pauseResult = sessionManager.setPlayback(targetSession, hostToken, {
        state: "paused",
        position,
      });

      if (!pauseResult.success) {
        return callback && callback(pauseResult);
      }

      console.log(
        `[SyncBeat Timing Server] Pause coordinated for session ${targetSession} (commandId: ${pauseResult.playback.commandId}, pos: ${pauseResult.playback.position}s)`
      );

      io.to(`session_${targetSession}`).emit("playback-command", {
        type: "pause",
        position: pauseResult.playback.position,
        scheduledAt: Date.now(),
        revision: pauseResult.playback.revision,
        commandId: pauseResult.playback.commandId,
      });

      io.to(`session_${targetSession}`).emit(
        "session-updated",
        sessionManager.getPublicState(targetSession)
      );
      if (callback) callback({ success: true, playback: pauseResult.playback });
    });

    // Playback control: Seek (Host authoritative)
    socket.on("request-seek", ({ sessionId, hostToken, position, leadTimeMs = 1000 }, callback) => {
      const targetSession = sessionId || currentSessionId;
      if (!sessionManager.isHostAuthorized(targetSession, hostToken)) {
        return callback && callback({ success: false, error: "Unauthorized: host privileges required." });
      }

      const session = sessionManager.getSession(targetSession);
      const isCurrentlyPlaying = session?.playback?.state === "playing";
      const scheduledAt = isCurrentlyPlaying ? Date.now() + Math.max(300, leadTimeMs) : Date.now();

      const seekResult = sessionManager.setPlayback(targetSession, hostToken, {
        state: session?.playback?.state || "paused",
        position,
        scheduledAt,
      });

      if (!seekResult.success) {
        return callback && callback(seekResult);
      }

      io.to(`session_${targetSession}`).emit("playback-command", {
        type: "seek",
        position: seekResult.playback.position,
        state: seekResult.playback.state,
        scheduledAt,
        revision: seekResult.playback.revision,
        commandId: seekResult.playback.commandId,
      });

      io.to(`session_${targetSession}`).emit(
        "session-updated",
        sessionManager.getPublicState(targetSession)
      );
      if (callback) callback({ success: true, playback: seekResult.playback });
    });

    /* ========================================================================
       MANUAL RESYNC PROTOCOL (SYNC PLAYBACK)
       ======================================================================== */

    // Step 1: Any participant clicks SYNC PLAYBACK -> sends request-resync
    socket.on("request-resync", ({ sessionId, participantId, trackId, position, isPlaying }, callback) => {
      const targetSession = sessionId || currentSessionId;
      const targetParticipant = participantId || currentParticipantId;

      const resyncResult = sessionManager.startResync(targetSession, targetParticipant, {
        trackId,
        position,
        isPlaying,
      });

      if (!resyncResult.success) {
        if (callback) callback(resyncResult);
        return;
      }

      const { resyncCommand } = resyncResult;
      const room = `session_${targetSession}`;

      // Broadcast RESYNC_BEGIN to all participants in session
      io.to(room).emit("resync-begin", resyncCommand);

      // Setup timeout timer to ensure session never gets stuck paused
      if (resyncTimers.has(resyncCommand.opId)) {
        clearTimeout(resyncTimers.get(resyncCommand.opId));
      }

      const timeoutTimer = setTimeout(() => {
        const currentSession = sessionManager.getSession(targetSession);
        if (
          currentSession?.resyncState &&
          currentSession.resyncState.opId === resyncCommand.opId &&
          !currentSession.resyncState.isComplete
        ) {
          console.log(
            `[Resync] Operation ${resyncCommand.opId} timed out waiting for all ACKs. Committing available ready devices.`
          );
          const commitResult = sessionManager.commitResync(targetSession, resyncCommand.opId, 1500);
          if (commitResult.success) {
            io.to(room).emit("resync-commit", commitResult.commit);
            io.to(room).emit("session-updated", sessionManager.getPublicState(targetSession));
          }
        }
        resyncTimers.delete(resyncCommand.opId);
      }, resyncCommand.timeoutMs || 4000);

      resyncTimers.set(resyncCommand.opId, timeoutTimer);

      if (callback) callback({ success: true, opId: resyncCommand.opId });
    });

    // Step 11: Participant acknowledges pause, alignment, and readiness
    socket.on("resync-ack", ({ sessionId, participantId, opId, ready, position }) => {
      const targetSession = sessionId || currentSessionId;
      const targetParticipant = participantId || currentParticipantId;

      const ackResult = sessionManager.acknowledgeResync(targetSession, targetParticipant, {
        opId,
        ready,
        position,
      });

      // If all participants acknowledged before timeout, commit immediately
      if (ackResult.allAcksReceived) {
        if (resyncTimers.has(opId)) {
          clearTimeout(resyncTimers.get(opId));
          resyncTimers.delete(opId);
        }

        const commitResult = sessionManager.commitResync(targetSession, opId, 1500);
        if (commitResult.success) {
          io.to(`session_${targetSession}`).emit("resync-commit", commitResult.commit);
          io.to(`session_${targetSession}`).emit(
            "session-updated",
            sessionManager.getPublicState(targetSession)
          );
        }
      }
    });

    // Periodic telemetry report for drift & RTT monitoring
    socket.on("playback-telemetry", ({ sessionId, participantId, position, isPlaying, drift, rtt, startupDelayMs, readyState }) => {
      const targetSession = sessionId || currentSessionId;
      const targetParticipant = participantId || currentParticipantId;
      if (!targetSession || !targetParticipant) return;

      sessionManager.updateParticipantTelemetry(targetSession, targetParticipant, {
        position,
        isPlaying,
        drift,
        rtt,
        startupDelayMs,
        readyState,
      });
    });

    // Step 6 of Coordinated Playback Protocol: Client reports playback started or error
    socket.on("playback-started", ({ sessionId, participantId, commandId, scheduledAt, actualStartedAt, startupDelayMs, initialPosition, success, error }) => {
      const targetSession = sessionId || currentSessionId;
      const targetParticipant = participantId || currentParticipantId;
      if (!targetSession || !targetParticipant) return;

      sessionManager.updateParticipantTelemetry(targetSession, targetParticipant, {
        startupDelayMs: Number(startupDelayMs) || 0,
        lastCommandId: commandId,
        playbackStartedAt: actualStartedAt || Date.now(),
        isStarted: success !== false,
        startError: error || null,
      });

      console.log(
        `[SyncBeat Timing Server] Step 6 Ack: Participant "${targetParticipant}" reported playback-started | commandId: ${commandId} | delay: ${startupDelayMs}ms | pos: ${initialPosition}s | success: ${success !== false}`
      );
    });

    /* ========================================================================
       SHARED QUEUE MANAGEMENT (OFFLINE & ONLINE SESSIONS)
       ======================================================================== */

    // Add track to shared queue
    socket.on("queue-add", ({ sessionId, hostToken, track, addedByName }, callback) => {
      const targetSession = sessionId || currentSessionId;
      if (!targetSession) return callback && callback({ success: false, error: "Missing sessionId." });

      const res = sessionManager.addToQueue(targetSession, hostToken, track, addedByName);
      if (!res.success) return callback && callback(res);

      const room = `session_${targetSession}`;
      io.to(room).emit("queue-updated", { queue: res.queue });
      io.to(room).emit("session-updated", sessionManager.getPublicState(targetSession));
      if (callback) callback(res);
    });

    // Remove track from shared queue
    socket.on("queue-remove", ({ sessionId, hostToken, queueId }, callback) => {
      const targetSession = sessionId || currentSessionId;
      if (!targetSession) return callback && callback({ success: false, error: "Missing sessionId." });

      const res = sessionManager.removeFromQueue(targetSession, hostToken, queueId);
      if (!res.success) return callback && callback(res);

      const room = `session_${targetSession}`;
      io.to(room).emit("queue-updated", { queue: res.queue });
      io.to(room).emit("session-updated", sessionManager.getPublicState(targetSession));
      if (callback) callback(res);
    });

    // Reorder tracks in shared queue
    socket.on("queue-reorder", ({ sessionId, hostToken, fromIndex, toIndex }, callback) => {
      const targetSession = sessionId || currentSessionId;
      if (!targetSession) return callback && callback({ success: false, error: "Missing sessionId." });

      const res = sessionManager.reorderQueue(targetSession, hostToken, fromIndex, toIndex);
      if (!res.success) return callback && callback(res);

      const room = `session_${targetSession}`;
      io.to(room).emit("queue-updated", { queue: res.queue });
      io.to(room).emit("session-updated", sessionManager.getPublicState(targetSession));
      if (callback) callback(res);
    });

    // Play next track from shared queue
    socket.on("queue-play-next", ({ sessionId, hostToken }, callback) => {
      const targetSession = sessionId || currentSessionId;
      if (!targetSession) return callback && callback({ success: false, error: "Missing sessionId." });

      const res = sessionManager.playNextInQueue(targetSession, hostToken);
      if (!res.success) return callback && callback(res);

      const room = `session_${targetSession}`;
      const downloadUrl = res.track.streamUrl || `/api/sessions/${targetSession}/track?v=${res.track.version}`;

      io.to(room).emit("track-published", {
        track: res.track,
        downloadUrl,
      });
      io.to(room).emit("queue-updated", { queue: res.queue });
      io.to(room).emit("session-updated", sessionManager.getPublicState(targetSession));
      if (callback) callback(res);
    });

    // Clear shared queue
    socket.on("queue-clear", ({ sessionId, hostToken }, callback) => {
      const targetSession = sessionId || currentSessionId;
      if (!targetSession) return callback && callback({ success: false, error: "Missing sessionId." });

      const res = sessionManager.clearQueue(targetSession, hostToken);
      if (!res.success) return callback && callback(res);

      const room = `session_${targetSession}`;
      io.to(room).emit("queue-updated", { queue: [] });
      io.to(room).emit("session-updated", sessionManager.getPublicState(targetSession));
      if (callback) callback(res);
    });

    // Disconnection
    socket.on("disconnect", () => {
      const disc = sessionManager.handleSocketDisconnect(socket.id);
      if (disc) {
        const { sessionId, participant, session } = disc;
        const room = `session_${sessionId}`;

        io.to(room).emit("participant-left", {
          participantId: participant.id,
          name: participant.name,
        });
        io.to(room).emit("session-updated", sessionManager.getPublicState(sessionId));

        // If the reference device disconnected during resync, notify and recover
        if (session.resyncState && session.resyncState.interrupted) {
          io.to(room).emit("resync-error", {
            opId: session.resyncState.opId,
            message: `Reference device (${session.resyncState.referenceName}) disconnected during synchronization.`,
          });
        }
      }
    });
  });
}

module.exports = { setupSyncSocket };
