/**
 * Centralized Socket.IO Client Manager for SyncBeat.
 * Handles socket creation, transport configuration, and reconnection logic.
 */

import { io } from "socket.io-client";
import musicService from "./musicService";

/**
 * Sanitize Socket.IO URL to prevent trailing slashes and fix host typos.
 */
export function sanitizeSocketUrl(url) {
  if (!url || typeof url !== "string") return "https://local-music-player.onrender.com";
  let cleaned = url.trim().replace(/\/$/, "");
  if (!cleaned || cleaned === "/" || cleaned.startsWith("/api")) {
    return "https://local-music-player.onrender.com";
  }
  if (cleaned.endsWith(".onrender.co")) {
    cleaned += "m";
  }
  // Vercel only hosts the static frontend; redirect socket connection to Render backend
  if (cleaned.includes("vercel.app")) {
    return "https://local-music-player.onrender.com";
  }
  return cleaned;
}

/**
 * Determine default Socket.IO endpoint.
 * In Electron: http://localhost:3001
 * In local browser: http://localhost:3001
 * In production web: https://local-music-player.onrender.com
 */
export function getDefaultSocketUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  if (import.meta.env?.VITE_SOCKET_URL) {
    return sanitizeSocketUrl(import.meta.env.VITE_SOCKET_URL);
  }

  if (musicService.isElectron()) {
    return "http://localhost:3001";
  }

  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return "http://localhost:3001";
  }

  return "https://local-music-player.onrender.com";
}

/**
 * Create and configure a Socket.IO connection.
 * @param {string} [serverUrl]
 * @param {Object} [customOptions]
 * @returns {Socket}
 */
export function createSocketConnection(serverUrl, customOptions = {}) {
  let targetUrl;
  if (serverUrl && typeof serverUrl === "string") {
    targetUrl = sanitizeSocketUrl(serverUrl);
  } else {
    targetUrl = getDefaultSocketUrl();
  }

  // Never attempt to open WebSocket connections to Vercel static origin in production web
  if (
    !targetUrl ||
    targetUrl.includes("vercel.app") ||
    (typeof window !== "undefined" && targetUrl === window.location.origin && !window.location.hostname.includes("localhost"))
  ) {
    targetUrl = "https://local-music-player.onrender.com";
  }

  const defaultOptions = {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 6,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  };

  const sock = io(targetUrl, {
    ...defaultOptions,
    ...customOptions,
  });

  return sock;
}

export default {
  getDefaultSocketUrl,
  createSocketConnection,
};
