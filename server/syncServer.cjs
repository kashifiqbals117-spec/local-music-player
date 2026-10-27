const express = require("express");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const { SessionManager } = require("./sessionManager.cjs");

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB limit
const ALLOWED_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".m4a",
  ".aac",
  ".flac",
  ".opus",
  ".webm",
]);

/**
 * Compute SHA-256 hash of a file on disk.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Factory to create and configure the SyncBeat server.
 * @param {Object} options
 * @param {number} [options.port=3001]
 * @param {string} [options.host='0.0.0.0']
 * @param {string} [options.uploadDir]
 * @param {string} [options.corsOrigin='*']
 * @returns {Object} { app, server, io, sessionManager, start, stop }
 */
function createSyncServer(options = {}) {
  const port = options.port || process.env.PORT || 3001;
  const host = options.host || "0.0.0.0";
  const uploadDir = options.uploadDir || path.join(os.tmpdir(), "syncbeat-shared");

  fs.mkdirSync(uploadDir, { recursive: true });

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: options.corsOrigin || "*",
      methods: ["GET", "POST"],
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  const sessionManager = new SessionManager();
  const resyncTimers = new Map(); // opId -> timeout timer

  // Middleware
  app.use(express.json());

  // CORS headers
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-host-token, x-participant-id");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Multer config for file upload
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return cb(new Error("Unsupported audio format. Supported: .mp3, .wav, .m4a, .ogg, .flac"));
      }
      cb(null, true);
    },
  });

  // --------------------------------------------------------------------------
  // REST API Endpoints
  // --------------------------------------------------------------------------

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: Date.now(),
      activeSessions: sessionManager.sessions.size,
    });
  });

  // Create a new session
  app.post("/api/sessions", (req, res) => {
    try {
      const { hostName = "Host", sessionId = null, mode = "offline" } = req.body || {};
      const result = sessionManager.createSession({ hostName, sessionId, mode });
      res.status(201).json(result);
    } catch (err) {
      console.error("Failed to create session:", err);
      res.status(500).json({ error: "Failed to create session." });
    }
  });

  // Get session state
  app.get("/api/sessions/:sessionId", (req, res) => {
    const sessionId = req.params.sessionId;
    const state = sessionManager.getPublicState(sessionId);
    if (!state) {
      return res.status(404).json({ error: "Session not found." });
    }
    res.json(state);
  });

  // Generate QR Code for session join link
  app.get("/api/sessions/:sessionId/qr", async (req, res) => {
    const sessionId = req.params.sessionId.toUpperCase().trim();
    if (!sessionManager.hasSession(sessionId)) {
      return res.status(404).json({ error: "Session not found." });
    }

    const hostHeader = req.get("host") || `localhost:${port}`;
    const protocol = req.protocol || "http";
    const joinUrl = `${protocol}://${hostHeader}/?session=${sessionId}`;

    try {
      const qrDataUrl = await QRCode.toDataURL(joinUrl, {
        width: 300,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      res.json({ sessionId, joinUrl, qrDataUrl });
    } catch (err) {
      console.error("QR Code generation error:", err);
      res.status(500).json({ error: "Failed to generate QR Code." });
    }
  });

  // Upload or set track for a session (Host only)
  app.post("/api/sessions/:sessionId/track", upload.single("audio"), async (req, res) => {
    const sessionId = req.params.sessionId.toUpperCase().trim();
    const hostToken = req.headers["x-host-token"] || req.body?.hostToken;

    if (!sessionManager.isHostAuthorized(sessionId, hostToken)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: "Unauthorized: host token required." });
    }

    let filePath;
    let originalName;
    let fileSize;
    let mimeType;

    if (req.file) {
      filePath = req.file.path;
      originalName = req.file.originalname;
      fileSize = req.file.size;
      mimeType = req.file.mimetype || "audio/mpeg";
    } else if (req.body?.localFilePath) {
      // Local file registration by desktop Electron host
      const localPath = req.body.localFilePath;
      if (!fs.existsSync(localPath)) {
        return res.status(400).json({ error: "Specified audio file does not exist on host." });
      }
      const stat = fs.statSync(localPath);
      filePath = localPath;
      originalName = path.basename(localPath);
      fileSize = stat.size;
      mimeType = "audio/mpeg";
    } else {
      return res.status(400).json({ error: "No audio file provided." });
    }

    try {
      const hash = await computeFileSha256(filePath);
      const title = req.body?.title || path.parse(originalName).name;
      const artist = req.body?.artist || "Unknown Artist";
      const album = req.body?.album || "";
      const duration = Number(req.body?.duration) || 0;

      const trackResult = sessionManager.setTrack(sessionId, hostToken, {
        title,
        artist,
        album,
        duration,
        hash,
        size: fileSize,
        mimeType,
        filename: originalName,
        filePath,
      });

      if (!trackResult.success) {
        return res.status(400).json({ error: trackResult.error });
      }

      // Notify all session participants via WebSocket
      io.to(`session_${sessionId}`).emit("track-published", {
        track: trackResult.track,
        downloadUrl: `/api/sessions/${sessionId}/track?v=${trackResult.track.version}`,
      });

      res.status(201).json({
        success: true,
        track: trackResult.track,
        downloadUrl: `/api/sessions/${sessionId}/track?v=${trackResult.track.version}`,
      });
    } catch (err) {
      console.error("Error processing track upload:", err);
      res.status(500).json({ error: "Failed to process audio file." });
    }
  });

  // Download / Stream track with Range Request support
  app.get("/api/sessions/:sessionId/track", (req, res) => {
    const sessionId = req.params.sessionId.toUpperCase().trim();
    const session = sessionManager.getSession(sessionId);

    if (!session || !session.currentTrack || !session.currentTrack.filePath) {
      return res.status(404).send("No track available in this session.");
    }

    const { filePath, filename, mimeType, size } = session.currentTrack;

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Audio file missing from server storage.");
    }

    const stat = fs.statSync(filePath);
    const totalSize = stat.size || size;
    const range = req.headers.range;

    // HTTP 206 Partial Content for efficient audio seeking and buffering
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize) {
        res.status(416).setHeader("Content-Range", `bytes */${totalSize}`);
        return res.end();
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mimeType || "audio/mpeg",
      });

      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": totalSize,
        "Content-Type": mimeType || "audio/mpeg",
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      });

      fs.createReadStream(filePath).pipe(res);
    }
  });

  // Host kicks participant
  app.delete("/api/sessions/:sessionId/participants/:participantId", (req, res) => {
    const { sessionId, participantId } = req.params;
    const hostToken = req.headers["x-host-token"] || req.query.hostToken;

    const result = sessionManager.removeParticipant(sessionId, hostToken, participantId);
    if (!result.success) {
      return res.status(403).json({ error: result.error });
    }

    // Notify kicked participant and room
    io.to(`session_${sessionId}`).emit("participant-kicked", {
      participantId,
      participant: result.removedParticipant,
    });
    io.to(`session_${sessionId}`).emit("session-updated", sessionManager.getPublicState(sessionId));

    res.json({ success: true, removed: result.removedParticipant });
  });

  // --------------------------------------------------------------------------
  // Socket.IO Event Handlers
  // --------------------------------------------------------------------------

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

      const readyState = isReady !== undefined ? Boolean(isReady) : (ready !== undefined ? Boolean(ready) : true);
      sessionManager.setParticipantReady(targetSession, targetParticipant, readyState);
      io.to(`session_${targetSession}`).emit("session-updated", sessionManager.getPublicState(targetSession));
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
        return callback && callback({
          success: false,
          error: `Cannot play yet: devices still preparing audio (${names}). Please wait a moment.`,
          unreadyNames: unready.map((p) => p.name),
        });
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

      io.to(`session_${targetSession}`).emit("playback-command", {
        type: "play",
        position: playResult.playback.position,
        scheduledAt,
        leadTimeMs: effectiveLeadTime,
        revision: playResult.playback.revision,
        commandId: playResult.playback.commandId,
      });

      io.to(`session_${targetSession}`).emit("session-updated", sessionManager.getPublicState(targetSession));
      if (callback) callback({ success: true, playback: playResult.playback, scheduledAt, leadTimeMs: effectiveLeadTime });
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

      io.to(`session_${targetSession}`).emit("playback-command", {
        type: "pause",
        position: pauseResult.playback.position,
        scheduledAt: Date.now(),
        revision: pauseResult.playback.revision,
        commandId: pauseResult.playback.commandId,
      });

      io.to(`session_${targetSession}`).emit("session-updated", sessionManager.getPublicState(targetSession));
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

      io.to(`session_${targetSession}`).emit("session-updated", sessionManager.getPublicState(targetSession));
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

      // Step 7: Broadcast RESYNC_BEGIN to all participants in session
      io.to(room).emit("resync-begin", resyncCommand);

      // Step 12-14: Setup timeout timer to ensure session never gets stuck paused
      if (resyncTimers.has(resyncCommand.opId)) {
        clearTimeout(resyncTimers.get(resyncCommand.opId));
      }

      const timeoutTimer = setTimeout(() => {
        const currentSession = sessionManager.getSession(targetSession);
        if (currentSession?.resyncState && currentSession.resyncState.opId === resyncCommand.opId && !currentSession.resyncState.isComplete) {
          console.log(`[Resync] Operation ${resyncCommand.opId} timed out waiting for all ACKs. Committing available ready devices.`);
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
          io.to(`session_${targetSession}`).emit("session-updated", sessionManager.getPublicState(targetSession));
        }
      }
    });

    // Periodic telemetry report for drift & RTT monitoring
    socket.on("playback-telemetry", ({ sessionId, participantId, position, isPlaying, drift, rtt }) => {
      const targetSession = sessionId || currentSessionId;
      const targetParticipant = participantId || currentParticipantId;
      if (!targetSession || !targetParticipant) return;

      sessionManager.updateParticipantTelemetry(targetSession, targetParticipant, {
        position,
        isPlaying,
        drift,
        rtt,
      });
    });

    // Disconnection
    socket.on("disconnect", () => {
      const disc = sessionManager.handleSocketDisconnect(socket.id);
      if (disc) {
        const { sessionId, participant, session } = disc;
        const room = `session_${sessionId}`;

        io.to(room).emit("participant-left", { participantId: participant.id, name: participant.name });
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

  // Serve static files from Vite's dist/ directory if it exists
  const distPath = path.join(__dirname, "..", "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
  }

  // Fallback route: serve index.html if present, else mobile guest page
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      return next();
    }
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    res.send("SyncBeat server is running.");
  });

  // Start server
  const start = () => {
    return new Promise((resolve, reject) => {
      server.listen(port, host, () => {
        console.log(`SyncBeat server running on http://${host}:${port}`);
        resolve({ port, host });
      });
      server.on("error", reject);
    });
  };

  // Stop server
  const stop = () => {
    return new Promise((resolve) => {
      // Clear any pending timers
      for (const timer of resyncTimers.values()) {
        clearTimeout(timer);
      }
      resyncTimers.clear();
      io.close(() => {
        server.close(resolve);
      });
    });
  };

  return {
    app,
    server,
    io,
    sessionManager,
    port,
    start,
    stop,
  };
}

// Allow direct CLI execution: node server/syncServer.cjs
if (require.main === module) {
  const syncServer = createSyncServer({ port: process.env.PORT || 3001 });
  syncServer.start().then(({ port }) => {
    console.log("\n==============================================");
    console.log(" SyncBeat Synchronized Session Server Started");
    console.log(` Port: ${port}`);
    console.log(" Available network addresses:");
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const addr of addrs || []) {
        if (addr.family === "IPv4" && !addr.internal) {
          console.log(`   http://${addr.address}:${port}`);
        }
      }
    }
    console.log("==============================================\n");
  });
}

module.exports = {
  createSyncServer,
  computeFileSha256,
};
