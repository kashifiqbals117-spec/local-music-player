/**
 * Centralized Socket.IO Client Manager for SyncBeat.
 * Handles socket creation, transport configuration, and reconnection logic.
 */

import { io } from "socket.io-client";
import musicService from "./musicService";

/**
 * Determine default Socket.IO endpoint.
 * In Electron: http://localhost:3001
 * In browser: window.location.origin (which proxies to backend via Vite in dev or connects to 3001 directly)
 */
export function getDefaultSocketUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  if (import.meta.env?.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }

  if (musicService.isElectron()) {
    return "http://localhost:3001";
  }

  if (window.location.protocol.startsWith("http")) {
    return window.location.origin;
  }

  return "http://localhost:3001";
}

/**
 * Create and configure a Socket.IO connection.
 * @param {string} [serverUrl]
 * @param {Object} [customOptions]
 * @returns {Socket}
 */
export function createSocketConnection(serverUrl, customOptions = {}) {
  const targetUrl = serverUrl || getDefaultSocketUrl();

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
