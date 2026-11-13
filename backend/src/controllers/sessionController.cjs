/**
 * Session Controller.
 * Handles session lifecycle, track distribution, streaming, and participant management.
 */

const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { computeFileSha256 } = require("../utils/hashUtils.cjs");

function createSessionController({ sessionManager, io, getPort }) {
  return {
    // Health check
    healthCheck: (_req, res) => {
      res.json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: Date.now(),
        activeSessions: sessionManager.sessions.size,
      });
    },

    // Create session
    createSession: (req, res) => {
      try {
        const { hostName = "Host", sessionId = null, mode = "offline" } = req.body || {};
        const result = sessionManager.createSession({ hostName, sessionId, mode });
        res.status(201).json(result);
      } catch (err) {
        console.error("Failed to create session:", err);
        res.status(500).json({ error: "Failed to create session." });
      }
    },

    // Get session state
    getSession: (req, res) => {
      const sessionId = req.params.sessionId;
      const state = sessionManager.getPublicState(sessionId);
      if (!state) {
        return res.status(404).json({ error: "Session not found." });
      }
      res.json(state);
    },

    // Generate QR code for session
    getQrCode: async (req, res) => {
      const sessionId = req.params.sessionId.toUpperCase().trim();
      if (!sessionManager.hasSession(sessionId)) {
        return res.status(404).json({ error: "Session not found." });
      }

      const port = getPort ? getPort() : 3001;
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
    },

    // Set / upload track for session
    setTrack: async (req, res) => {
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
      } else if (req.body?.source === "audius" || req.body?.onlineTrack || req.body?.streamUrl) {
        // Online track registration (Audius streaming track)
        const online = req.body.onlineTrack || req.body;
        const trackId = online.id || online.trackId;
        const trackTitle = online.title || online.name || "Untitled Track";
        const trackArtist = online.artist || "Unknown Artist";
        const trackAlbum = online.album || "";
        const trackDuration = Number(online.duration) || 0;
        const trackArtwork = online.artwork || null;
        const streamUrl = online.streamUrl || `/api/music/stream/${trackId}`;

        const trackResult = sessionManager.setTrack(sessionId, hostToken, {
          id: trackId,
          title: trackTitle,
          artist: trackArtist,
          album: trackAlbum,
          duration: trackDuration,
          hash: `audius-${trackId}`,
          size: 0,
          mimeType: "audio/mpeg",
          filename: `${trackTitle}.mp3`,
          filePath: null,
          source: "audius",
          streamUrl,
          artwork: trackArtwork,
        });

        if (!trackResult.success) {
          return res.status(400).json({ error: trackResult.error });
        }

        // Notify all session participants via WebSocket with streaming URL
        io.to(`session_${sessionId}`).emit("track-published", {
          track: trackResult.track,
          downloadUrl: streamUrl,
        });

        return res.status(201).json({
          success: true,
          track: trackResult.track,
          downloadUrl: streamUrl,
        });
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
    },

    // Stream track (HTTP 206 Partial Content or redirect for online stream)
    streamTrack: (req, res) => {
      const sessionId = req.params.sessionId.toUpperCase().trim();
      const session = sessionManager.getSession(sessionId);

      if (!session || !session.currentTrack) {
        return res.status(404).send("No track available in this session.");
      }

      // If current track is an online Audius track, redirect to stream URL
      if (session.currentTrack.source === "audius" || session.currentTrack.streamUrl) {
        const streamUrl = session.currentTrack.streamUrl || `/api/music/stream/${session.currentTrack.id}`;
        return res.redirect(302, streamUrl);
      }

      if (!session.currentTrack.filePath) {
        return res.status(404).send("Audio file path missing for session track.");
      }

      const { filePath, filename, mimeType, size } = session.currentTrack;

      if (!fs.existsSync(filePath)) {
        return res.status(404).send("Audio file missing from server storage.");
      }

      const stat = fs.statSync(filePath);
      const totalSize = stat.size || size;
      const range = req.headers.range;

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
    },

    // Kick participant
    removeParticipant: (req, res) => {
      const { sessionId, participantId } = req.params;
      const hostToken = req.headers["x-host-token"] || req.query.hostToken;

      const result = sessionManager.removeParticipant(sessionId, hostToken, participantId);
      if (!result.success) {
        return res.status(403).json({ error: result.error });
      }

      io.to(`session_${sessionId}`).emit("participant-kicked", {
        participantId,
        participant: result.removedParticipant,
      });
      io.to(`session_${sessionId}`).emit(
        "session-updated",
        sessionManager.getPublicState(sessionId)
      );

      res.json({ success: true, removed: result.removedParticipant });
    },
  };
}

module.exports = { createSessionController };
