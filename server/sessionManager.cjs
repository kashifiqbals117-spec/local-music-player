const { randomUUID, randomBytes } = require("crypto");

/**
 * Generate a clean, human-friendly 6-character session code.
 * Excludes easily confusable characters (0, O, 1, I, L).
 */
function generateSessionId() {
  const chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

class SessionManager {
  constructor() {
    /** @type {Map<string, Object>} */
    this.sessions = new Map();
    /** @type {Map<string, { sessionId: string, participantId: string }>} */
    this.socketMap = new Map();
  }

  /**
   * Create a new listening session.
   * @param {Object} options
   * @param {string} options.hostName - Name of the host participant
   * @param {string} [options.sessionId] - Optional custom session ID
   * @param {string} [options.mode] - 'online' | 'offline'
   * @returns {Object} Session details including hostToken
   */
  createSession({ hostName = "Host", sessionId = null, mode = "offline" } = {}) {
    let id = sessionId ? sessionId.toUpperCase().trim() : generateSessionId();

    // Ensure uniqueness
    let attempts = 0;
    while (this.sessions.has(id) && attempts < 10) {
      id = generateSessionId();
      attempts++;
    }

    const hostToken = randomBytes(24).toString("hex");
    const hostParticipantId = "p_host_" + randomBytes(8).toString("hex");
    const hostClientToken = randomBytes(16).toString("hex");

    const session = {
      id,
      hostToken,
      hostParticipantId,
      mode,
      createdAt: Date.now(),
      participants: new Map(),
      currentTrack: null,
      trackVersion: 0,
      playback: {
        state: "paused", // 'playing' | 'paused'
        position: 0,
        updatedAt: Date.now(),
        serverTimestamp: Date.now(),
        revision: 1,
        commandId: randomUUID(),
      },
      resyncState: null,
      history: [],
    };

    // Register host as the first participant
    session.participants.set(hostParticipantId, {
      id: hostParticipantId,
      name: hostName.trim() || "Host",
      isHost: true,
      clientToken: hostClientToken,
      socketId: null,
      connected: false,
      isReady: false,
      position: 0,
      isPlaying: false,
      drift: 0,
      lastPing: Date.now(),
      joinedAt: Date.now(),
    });

    this.sessions.set(id, session);
    return {
      session: this.getPublicState(id),
      hostToken,
      hostParticipantId,
      clientToken: hostClientToken,
    };
  }

  /**
   * Check if session exists.
   * @param {string} sessionId
   * @returns {boolean}
   */
  hasSession(sessionId) {
    if (!sessionId) return false;
    return this.sessions.has(sessionId.toUpperCase().trim());
  }

  /**
   * Get raw session object.
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSession(sessionId) {
    if (!sessionId) return null;
    return this.sessions.get(sessionId.toUpperCase().trim()) || null;
  }

  /**
   * Validate host authorization.
   * @param {string} sessionId
   * @param {string} hostToken
   * @returns {boolean}
   */
  isHostAuthorized(sessionId, hostToken) {
    const session = this.getSession(sessionId);
    if (!session || !hostToken) return false;
    return session.hostToken === hostToken;
  }

  /**
   * Join or reconnect a participant to a session.
   * @param {string} sessionId
   * @param {Object} options
   * @param {string} options.name
   * @param {string} options.socketId
   * @param {string} [options.participantId]
   * @param {string} [options.clientToken]
   * @returns {{ success: boolean, participant?: Object, error?: string }}
   */
  joinSession(sessionId, { name = "Guest", socketId, participantId, clientToken } = {}) {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, error: "Session not found." };
    }

    // Reconnection handling: check if participant already exists with valid token
    if (participantId && clientToken && session.participants.has(participantId)) {
      const existing = session.participants.get(participantId);
      if (existing.clientToken === clientToken) {
        // Disassociate old socket if any
        if (existing.socketId) {
          this.socketMap.delete(existing.socketId);
        }
        existing.socketId = socketId;
        existing.connected = true;
        existing.lastPing = Date.now();
        if (name && name.trim()) existing.name = name.trim();

        if (socketId) {
          this.socketMap.set(socketId, { sessionId: session.id, participantId });
        }

        return {
          success: true,
          isReconnect: true,
          participant: { ...existing, clientToken: undefined },
          clientToken: existing.clientToken,
        };
      }
    }

    // New participant joining
    const newParticipantId = "p_" + randomBytes(8).toString("hex");
    const newClientToken = randomBytes(16).toString("hex");

    let cleanName = (name || "Guest").trim().slice(0, 24);
    // Deduplicate display names if needed
    let nameAttempt = cleanName;
    let counter = 1;
    const existingNames = new Set(Array.from(session.participants.values()).map((p) => p.name.toLowerCase()));
    while (existingNames.has(nameAttempt.toLowerCase())) {
      nameAttempt = `${cleanName} (${++counter})`;
    }

    const participant = {
      id: newParticipantId,
      name: nameAttempt,
      isHost: false,
      clientToken: newClientToken,
      socketId,
      connected: true,
      isReady: false,
      position: 0,
      isPlaying: false,
      drift: 0,
      lastPing: Date.now(),
      joinedAt: Date.now(),
    };

    session.participants.set(newParticipantId, participant);
    if (socketId) {
      this.socketMap.set(socketId, { sessionId: session.id, participantId: newParticipantId });
    }

    return {
      success: true,
      isReconnect: false,
      participant: { ...participant, clientToken: undefined },
      clientToken: newClientToken,
    };
  }

  /**
   * Handle socket disconnection.
   * @param {string} socketId
   * @returns {{ sessionId: string, participantId: string, participant: Object, session: Object } | null}
   */
  handleSocketDisconnect(socketId) {
    const mapping = this.socketMap.get(socketId);
    if (!mapping) return null;

    this.socketMap.delete(socketId);
    const session = this.getSession(mapping.sessionId);
    if (!session) return null;

    const participant = session.participants.get(mapping.participantId);
    if (!participant) return null;

    participant.connected = false;
    participant.socketId = null;

    // Check if an active resync needs handling
    if (session.resyncState && session.resyncState.referenceParticipantId === participant.id) {
      session.resyncState.interrupted = true;
    }

    return {
      sessionId: session.id,
      participantId: participant.id,
      participant,
      session,
    };
  }

  /**
   * Host removes a participant.
   * @param {string} sessionId
   * @param {string} hostToken
   * @param {string} participantId
   * @returns {{ success: boolean, removedParticipant?: Object, error?: string }}
   */
  removeParticipant(sessionId, hostToken, participantId) {
    if (!this.isHostAuthorized(sessionId, hostToken)) {
      return { success: false, error: "Unauthorized: host privileges required." };
    }

    const session = this.getSession(sessionId);
    if (!session.participants.has(participantId)) {
      return { success: false, error: "Participant not found." };
    }

    const participant = session.participants.get(participantId);
    if (participant.isHost) {
      return { success: false, error: "Cannot kick the host." };
    }

    if (participant.socketId) {
      this.socketMap.delete(participant.socketId);
    }
    session.participants.delete(participantId);

    return { success: true, removedParticipant: participant };
  }

  /**
   * Update participant readiness state for the current track.
   * @param {string} sessionId
   * @param {string} participantId
   * @param {boolean} isReady
   * @returns {boolean}
   */
  setParticipantReady(sessionId, participantId, isReady) {
    const session = this.getSession(sessionId);
    if (!session || !session.participants.has(participantId)) return false;

    const p = session.participants.get(participantId);
    p.isReady = Boolean(isReady);
    return true;
  }

  /**
   * Update participant playback telemetry (drift & latency tracking).
   * @param {string} sessionId
   * @param {string} participantId
   * @param {Object} telemetry
   */
  updateParticipantTelemetry(sessionId, participantId, { position = 0, isPlaying = false, drift = 0, rtt = 0 } = {}) {
    const session = this.getSession(sessionId);
    if (!session || !session.participants.has(participantId)) return;

    const p = session.participants.get(participantId);
    p.position = Number(position) || 0;
    p.isPlaying = Boolean(isPlaying);
    p.drift = Number(drift) || 0;
    if (Number.isFinite(rtt) && rtt > 0) {
      p.rtt = Math.round(Number(rtt));
    }
    p.lastPing = Date.now();
  }

  /**
   * Get maximum measured RTT across connected participants in a session.
   * @param {string} sessionId
   * @returns {number} max RTT in milliseconds (at least 20ms)
   */
  getConnectedMaxRtt(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return 40;
    let maxRtt = 20;
    for (const p of session.participants.values()) {
      if (p.connected && Number.isFinite(p.rtt) && p.rtt > 0) {
        maxRtt = Math.max(maxRtt, p.rtt);
      }
    }
    return maxRtt;
  }

  /**
   * Update or publish a track for the session.
   * @param {string} sessionId
   * @param {string} hostToken
   * @param {Object} track
   * @returns {{ success: boolean, track?: Object, error?: string }}
   */
  setTrack(sessionId, hostToken, track) {
    if (!this.isHostAuthorized(sessionId, hostToken)) {
      return { success: false, error: "Unauthorized: host privileges required." };
    }

    const session = this.getSession(sessionId);
    session.trackVersion += 1;

    session.currentTrack = {
      id: track.id || randomUUID(),
      title: track.title || track.name || "Untitled Track",
      artist: track.artist || "Unknown Artist",
      album: track.album || "",
      duration: Number(track.duration) || 0,
      hash: track.hash || "", // SHA-256
      size: Number(track.size) || 0,
      mimeType: track.mimeType || "audio/mpeg",
      filename: track.filename || "track.mp3",
      filePath: track.filePath || null,
      version: session.trackVersion,
      uploadedAt: Date.now(),
    };

    // Reset readiness on new track: Host has local file ready, guests must verify
    for (const p of session.participants.values()) {
      p.isReady = Boolean(p.isHost);
      p.position = 0;
    }

    // Reset playback to start
    session.playback = {
      state: "paused",
      position: 0,
      updatedAt: Date.now(),
      serverTimestamp: Date.now(),
      revision: session.playback.revision + 1,
      commandId: randomUUID(),
    };

    return { success: true, track: session.currentTrack };
  }

  /**
   * Update playback state (play, pause, seek).
   * @param {string} sessionId
   * @param {string} hostToken
   * @param {Object} command
   * @returns {{ success: boolean, playback?: Object, error?: string }}
   */
  setPlayback(sessionId, hostToken, { state, position, scheduledAt = null, revision = null }) {
    if (!this.isHostAuthorized(sessionId, hostToken)) {
      return { success: false, error: "Unauthorized: host privileges required." };
    }

    const session = this.getSession(sessionId);
    if (!session) return { success: false, error: "Session not found." };

    // Discard stale revision commands
    if (revision !== null && revision < session.playback.revision) {
      return { success: false, error: "Stale playback revision." };
    }

    const now = Date.now();
    const safePos = Math.max(0, Number(position) || 0);
    const nextRevision = session.playback.revision + 1;

    session.playback = {
      state: state === "playing" ? "playing" : "paused",
      position: safePos,
      updatedAt: now,
      serverTimestamp: scheduledAt || now,
      revision: nextRevision,
      commandId: randomUUID(),
    };

    return { success: true, playback: session.playback };
  }

  /**
   * Compute current interpolated track playback position.
   * @param {string} sessionId
   * @returns {number}
   */
  getCurrentPosition(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return 0;

    const { state, position, updatedAt } = session.playback;
    if (state !== "playing") return position;

    const elapsedSeconds = Math.max(0, (Date.now() - updatedAt) / 1000);
    const duration = session.currentTrack?.duration || Infinity;
    return Math.min(position + elapsedSeconds, duration);
  }

  /* ========================================================================
     MANUAL RESYNC PROTOCOL (SYNC PLAYBACK)
     ======================================================================== */

  /**
   * Step 1-6: A participant initiates resynchronization.
   * That participant becomes the temporary reference device.
   * @param {string} sessionId
   * @param {string} participantId
   * @param {Object} options
   * @returns {{ success: boolean, resyncCommand?: Object, error?: string }}
   */
  startResync(sessionId, participantId, { trackId, position, isPlaying = true } = {}) {
    const session = this.getSession(sessionId);
    if (!session) return { success: false, error: "Session not found." };

    const participant = session.participants.get(participantId);
    if (!participant || !participant.connected) {
      return { success: false, error: "Participant not found or disconnected." };
    }

    // Check if another resync is currently in progress
    if (session.resyncState && !session.resyncState.isComplete) {
      const elapsed = Date.now() - session.resyncState.startedAt;
      if (elapsed < 6000) {
        return {
          success: false,
          error: `Another resync requested by ${session.resyncState.referenceName} is already in progress. Please wait.`,
        };
      }
    }

    // Validate track if track is loaded
    if (session.currentTrack) {
      if (trackId && trackId !== session.currentTrack.id) {
        return {
          success: false,
          error: "Cannot resync: requesting device is on a different track.",
        };
      }
    }

    const opId = "resync_" + Date.now() + "_" + randomBytes(4).toString("hex");
    const nextRevision = session.playback.revision + 1;
    const safePos = Math.max(0, Number(position) || 0);

    // Pause the session during resync
    session.playback = {
      state: "paused",
      position: safePos,
      updatedAt: Date.now(),
      serverTimestamp: Date.now(),
      revision: nextRevision,
      commandId: opId,
    };

    const resyncState = {
      opId,
      revision: nextRevision,
      referenceParticipantId: participant.id,
      referenceName: participant.name,
      referencePosition: safePos,
      referenceTrackId: session.currentTrack?.id || null,
      shouldResumePlaying: Boolean(isPlaying),
      startedAt: Date.now(),
      timeoutMs: 4000,
      acks: new Map(),
      isComplete: false,
      interrupted: false,
    };

    // Reference device automatically acknowledges readiness
    resyncState.acks.set(participant.id, { ready: true, position: safePos, at: Date.now() });
    session.resyncState = resyncState;

    return {
      success: true,
      resyncCommand: {
        opId,
        revision: nextRevision,
        referenceParticipantId: participant.id,
        referenceName: participant.name,
        trackId: resyncState.referenceTrackId,
        position: safePos,
        timeoutMs: resyncState.timeoutMs,
      },
    };
  }

  /**
   * Step 11: Participant acknowledges pause and alignment.
   * @param {string} sessionId
   * @param {string} participantId
   * @param {Object} ack
   * @returns {{ allAcksReceived: boolean, ackCount: number, expectedCount: number }}
   */
  acknowledgeResync(sessionId, participantId, { opId, ready = true, position = 0 } = {}) {
    const session = this.getSession(sessionId);
    if (!session || !session.resyncState) return { allAcksReceived: false };

    const { resyncState } = session;
    if (resyncState.opId !== opId || resyncState.isComplete) {
      return { allAcksReceived: false };
    }

    resyncState.acks.set(participantId, {
      ready: Boolean(ready),
      position: Number(position) || 0,
      at: Date.now(),
    });

    const connectedParticipants = Array.from(session.participants.values()).filter((p) => p.connected);
    const allAcksReceived = connectedParticipants.every((p) => resyncState.acks.has(p.id));

    return {
      allAcksReceived,
      ackCount: resyncState.acks.size,
      expectedCount: connectedParticipants.length,
    };
  }

  /**
   * Step 14-16: Commit resynchronization with a scheduled future resume timestamp.
   * @param {string} sessionId
   * @param {string} opId
   * @param {number} [leadTimeMs=1500]
   * @returns {{ success: boolean, commit?: Object, error?: string }}
   */
  commitResync(sessionId, opId, leadTimeMs = 1500) {
    const session = this.getSession(sessionId);
    if (!session || !session.resyncState) {
      return { success: false, error: "No active resync operation." };
    }

    const { resyncState } = session;
    if (resyncState.opId !== opId) {
      return { success: false, error: "Mismatched resync operation ID." };
    }

    const maxRtt = this.getConnectedMaxRtt(sessionId);
    const dynamicLeadTime = Math.max(1200, Math.round(maxRtt * 3 + 800));
    const effectiveLeadTime = Math.max(dynamicLeadTime, Number(leadTimeMs) || 1200);
    const scheduledResumeAt = Date.now() + effectiveLeadTime;
    const finalState = resyncState.shouldResumePlaying ? "playing" : "paused";

    session.playback = {
      state: finalState,
      position: resyncState.referencePosition,
      updatedAt: scheduledResumeAt,
      serverTimestamp: scheduledResumeAt,
      revision: resyncState.revision,
      commandId: opId,
    };

    const readyParticipants = [];
    const unreadyParticipants = [];

    for (const p of session.participants.values()) {
      if (!p.connected) continue;
      const ack = resyncState.acks.get(p.id);
      if (ack && ack.ready) {
        readyParticipants.push(p.name);
      } else {
        unreadyParticipants.push(p.name);
      }
    }

    resyncState.isComplete = true;

    return {
      success: true,
      commit: {
        opId,
        revision: resyncState.revision,
        trackId: resyncState.referenceTrackId,
        position: resyncState.referencePosition,
        scheduledResumeAt,
        state: finalState,
        referenceName: resyncState.referenceName,
        readyParticipants,
        unreadyParticipants,
      },
    };
  }

  /**
   * Cancel or abort an active resync.
   * @param {string} sessionId
   * @param {string} opId
   * @param {string} reason
   * @returns {boolean}
   */
  abortResync(sessionId, opId, reason = "Operation cancelled.") {
    const session = this.getSession(sessionId);
    if (!session || !session.resyncState) return false;
    if (session.resyncState.opId !== opId) return false;

    session.resyncState.isComplete = true;
    session.resyncState.abortReason = reason;
    return true;
  }

  /**
   * Return a sanitized public snapshot of the session for clients.
   * Never exposes hostToken or clientToken.
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getPublicState(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const participants = Array.from(session.participants.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      connected: p.connected,
      isReady: p.isReady,
      position: p.position,
      isPlaying: p.isPlaying,
      drift: p.drift,
      lastPing: p.lastPing,
    }));

    return {
      id: session.id,
      mode: session.mode,
      createdAt: session.createdAt,
      participantCount: participants.filter((p) => p.connected).length,
      participants,
      currentTrack: session.currentTrack
        ? {
            id: session.currentTrack.id,
            title: session.currentTrack.title,
            artist: session.currentTrack.artist,
            album: session.currentTrack.album,
            duration: session.currentTrack.duration,
            hash: session.currentTrack.hash,
            size: session.currentTrack.size,
            version: session.currentTrack.version,
          }
        : null,
      playback: {
        state: session.playback.state,
        position: this.getCurrentPosition(sessionId),
        updatedAt: session.playback.updatedAt,
        serverTimestamp: session.playback.serverTimestamp,
        revision: session.playback.revision,
      },
      resync: session.resyncState && !session.resyncState.isComplete
        ? {
            opId: session.resyncState.opId,
            referenceName: session.resyncState.referenceName,
            startedAt: session.resyncState.startedAt,
          }
        : null,
    };
  }

  /**
   * Destroy session.
   * @param {string} sessionId
   */
  destroySession(sessionId) {
    const cleanId = (sessionId || "").toUpperCase().trim();
    const session = this.sessions.get(cleanId);
    if (!session) return;

    for (const p of session.participants.values()) {
      if (p.socketId) {
        this.socketMap.delete(p.socketId);
      }
    }
    this.sessions.delete(cleanId);
  }
}

module.exports = {
  SessionManager,
  generateSessionId,
};
