/**
 * Centralized CORS Configuration for SyncBeat.
 * Configures permitted origins, methods, headers, and preflights for Express and Socket.IO.
 */

function parseOrigins(envVal) {
  if (!envVal) return [];
  return envVal
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function getPermittedOrigins() {
  const railwayOrigin = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "";

  const envOrigins = [
    ...parseOrigins(process.env.CORS_ORIGINS),
    ...parseOrigins(process.env.FRONTEND_URL),
    ...parseOrigins(process.env.CORS_ORIGIN),
    ...parseOrigins(process.env.RENDER_EXTERNAL_URL),
    ...parseOrigins(railwayOrigin),
  ];

  const defaultOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "https://local-music-player-2k9z.vercel.app",
    "https://local-music-player.onrender.com",
  ];

  return [...new Set([...defaultOrigins, ...envOrigins])];
}

/**
 * Origin validation function suitable for both express cors and socket.io cors.
 * @param {string|undefined} origin
 * @param {Object} [options]
 * @returns {boolean}
 */
function isOriginAllowed(origin, options = {}) {
  // Allow requests with no origin (e.g. mobile apps, Electron desktop, curl, server-to-server)
  if (!origin) return true;

  // Wildcard override (e.g. for offline local-network hotspot mode B)
  if (options.corsOrigin === "*" || process.env.CORS_ALLOW_ALL === "true") {
    return true;
  }

  const cleanOrigin = origin.trim().replace(/\/$/, "");

  const customAllowed = Array.isArray(options.corsOrigin)
    ? options.corsOrigin.map((o) => (typeof o === "string" ? o.trim().replace(/\/$/, "") : o))
    : options.corsOrigin
    ? [String(options.corsOrigin).trim().replace(/\/$/, "")]
    : options.allowedOrigins || [];

  const allowed = [...getPermittedOrigins(), ...customAllowed];
  if (allowed.includes("*") || allowed.includes(cleanOrigin)) {
    return true;
  }

  // Allow all Vercel deployment and preview subdomains for this project
  if (/^https:\/\/local-music-player[a-z0-9-]*\.vercel\.app$/.test(cleanOrigin)) {
    return true;
  }

  // In non-production or offline LAN mode, permit private network RFC1918 addresses
  const isDevOrOffline = process.env.NODE_ENV !== "production" || options.mode === "offline";
  if (isDevOrOffline) {
    const isPrivateLan = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
      cleanOrigin
    );
    if (isPrivateLan) return true;
  }

  return false;
}

/**
 * Creates Express CORS middleware options.
 * @param {Object} [options]
 * @returns {Object}
 */
function createExpressCorsOptions(options = {}) {
  return {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin, options)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS Error: Origin ${origin} is not allowed.`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-host-token",
      "x-participant-id",
      "Range",
    ],
    exposedHeaders: ["Content-Length", "Content-Range", "Accept-Ranges"],
    credentials: false, // Never wildcard credentials
    optionsSuccessStatus: 200,
  };
}

/**
 * Creates Socket.IO CORS options.
 * @param {Object} [options]
 * @returns {Object}
 */
function createSocketCorsOptions(options = {}) {
  return {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin, options)) {
        callback(null, true);
      } else {
        callback(new Error(`Socket.IO CORS Error: Origin ${origin} is not allowed.`));
      }
    },
    methods: ["GET", "POST"],
    credentials: false,
  };
}

module.exports = {
  getPermittedOrigins,
  isOriginAllowed,
  createExpressCorsOptions,
  createSocketCorsOptions,
};
