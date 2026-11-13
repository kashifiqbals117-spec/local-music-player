/**
 * Express Application Factory for SyncBeat.
 * Configures centralized CORS, JSON parsing, API routes, media routes, and static assets.
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { createExpressCorsOptions } = require("./config/cors.cjs");
const { createAudioUploadMiddleware } = require("./middleware/uploadMiddleware.cjs");
const { createSessionController } = require("./controllers/sessionController.cjs");
const { createSessionRoutes } = require("./routes/sessionRoutes.cjs");
const { createMediaRoutes } = require("./routes/mediaRoutes.cjs");
const { AudiusService } = require("./services/audiusService.cjs");
const { createMusicController } = require("./controllers/musicController.cjs");
const { createMusicRoutes } = require("./routes/musicRoutes.cjs");

function createApp({ sessionManager, io, uploadDir, corsOptions = {}, getPort, audiusService = null }) {
  const app = express();
  app.set("trust proxy", 1);

  // Initialize Audius Service & Music Controller
  const resolvedAudiusService = audiusService || new AudiusService();
  const musicController = createMusicController({ audiusService: resolvedAudiusService });

  // 1. Centralized CORS middleware
  const expressCors = cors(createExpressCorsOptions(corsOptions));
  app.use(expressCors);

  // 2. Standard Body Parsers
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // 3. Audio upload middleware
  const audioUpload = createAudioUploadMiddleware(uploadDir);

  // 4. Session Controller & Routes
  const sessionController = createSessionController({ sessionManager, io, getPort });
  app.get("/health", sessionController.healthCheck);
  app.use("/api/sessions", createSessionRoutes({ sessionController, audioUpload }));

  // 5. Cloudinary Media Routes
  app.use("/api/media", createMediaRoutes());

  // 6. Audius Online Music Discovery & Streaming Routes
  app.use("/api/music", createMusicRoutes({ musicController }));

  // 6. Serve static files from Vite's frontend/dist directory if it exists
  const candidateDistPaths = [
    path.join(__dirname, "..", "..", "frontend", "dist"),
    path.join(__dirname, "..", "..", "dist"),
  ];
  const distPath = candidateDistPaths.find((p) => fs.existsSync(p));
  if (distPath) {
    app.use(express.static(distPath));

    // Client-side routing fallback for SPA
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      if (req.path.startsWith("/api") || req.path.startsWith("/socket.io") || req.path === "/health") {
        return next();
      }
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  } else {
    // When frontend is hosted separately on Vercel, redirect root hits gracefully
    app.get("/", (req, res) => {
      const frontendUrl = (process.env.FRONTEND_URL || "https://local-music-player-2k9z.vercel.app").replace(/\/$/, "");
      const target = req.query.session ? `${frontendUrl}/?session=${encodeURIComponent(req.query.session)}` : frontendUrl;
      res.redirect(302, target);
    });
  }

  // 7. Centralized Error Handler
  app.use((err, _req, res, _next) => {
    if (err.message && err.message.startsWith("CORS Error")) {
      return res.status(403).json({ error: err.message });
    }
    console.error("[SyncBeat Server Error]:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal server error.",
    });
  });

  return app;
}

module.exports = { createApp };
