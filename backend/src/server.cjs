/**
 * SyncBeat Server Module.
 * Initializes Express, Socket.IO, SessionManager, and HTTP server.
 */

const path = require("path");
const dotenv = require("dotenv");
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
const http = require("http");
const os = require("os");
const fs = require("fs");
const { Server } = require("socket.io");
const { SessionManager } = require("./services/sessionManager.cjs");
const { createApp } = require("./app.cjs");
const { setupSyncSocket } = require("./sockets/syncSocket.cjs");
const { createSocketCorsOptions } = require("./config/cors.cjs");
const { computeFileSha256 } = require("./utils/hashUtils.cjs");
const { validateEnv } = require("./config/envValidator.cjs");

/**
 * Factory to create and configure the SyncBeat server.
 * @param {Object} [options]
 * @param {number} [options.port=3001]
 * @param {string} [options.host='0.0.0.0']
 * @param {string} [options.uploadDir]
 * @param {string|string[]} [options.corsOrigin]
 * @returns {Object} { app, server, io, sessionManager, start, stop, port }
 */
function createSyncServer(options = {}) {
  const port = options.port || Number(process.env.PORT) || 3001;
  const host = options.host || "0.0.0.0";
  const uploadDir = options.uploadDir || path.join(os.tmpdir(), "syncbeat-shared");

  fs.mkdirSync(uploadDir, { recursive: true });

  const sessionManager = new SessionManager();
  const resyncTimers = new Map();

  let actualPort = port;
  let ioInstance = null;

  // Proxy io reference so Express routes can broadcast before Server(server) initializes
  const ioProxy = {
    to: (...args) => (ioInstance ? ioInstance.to(...args) : { emit: () => {} }),
    emit: (...args) => (ioInstance ? ioInstance.emit(...args) : undefined),
  };

  // Express Application
  const app = createApp({
    sessionManager,
    io: ioProxy,
    uploadDir,
    corsOptions: options,
    getPort: () => actualPort,
  });

  // Attach app directly to HTTP Server
  const server = http.createServer(app);

  // Socket.IO with consistent CORS
  const io = new Server(server, {
    cors: createSocketCorsOptions(options),
    pingInterval: 10000,
    pingTimeout: 5000,
  });
  ioInstance = io;

  // Setup Socket.IO Event Handlers
  setupSyncSocket({ io, sessionManager, resyncTimers });

  let isRunning = false;

  const start = () => {
    return new Promise((resolve, reject) => {
      server.listen(port, host, () => {
        isRunning = true;
        actualPort = server.address().port;
        console.log(`SyncBeat server running on http://${host}:${actualPort}`);
        resolve({ port: actualPort, host });
      });
      server.on("error", (err) => {
        if (!isRunning) reject(err);
      });
    });
  };

  const stop = () => {
    return new Promise((resolve) => {
      // Clear all active resync timers
      for (const timer of resyncTimers.values()) {
        clearTimeout(timer);
      }
      resyncTimers.clear();

      io.close(() => {
        server.close(() => {
          isRunning = false;
          resolve();
        });
      });
    });
  };

  return {
    app,
    server,
    io,
    sessionManager,
    start,
    stop,
    get port() {
      return actualPort;
    },
  };
}

// Direct execution from CLI: node backend/src/server.cjs
if (require.main === module) {
  const envCheck = validateEnv();
  for (const info of envCheck.info) {
    console.log(`[SyncBeat Config] ${info}`);
  }
  for (const warn of envCheck.warnings) {
    console.warn(`[SyncBeat Warning] ${warn}`);
  }

  const syncServer = createSyncServer();
  syncServer.start().catch((err) => {
    console.error("Failed to start SyncBeat backend server:", err);
    process.exit(1);
  });
}

module.exports = {
  createSyncServer,
  computeFileSha256,
};
