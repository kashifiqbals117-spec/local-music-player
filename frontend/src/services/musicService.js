/**
 * Service to centralize calls to Electron IPC bridge (window.electronAPI).
 * Ensures safe fallbacks if accessed outside Electron context.
 */

function getElectronAPI() {
  if (typeof window !== "undefined" && window.electronAPI) {
    return window.electronAPI;
  }
  console.warn("Electron API is not available in the current environment.");
  return null;
}

export const musicService = {
  /**
   * Fetch all songs stored in SQLite database.
   * @returns {Promise<Array>} List of songs
   */
  async getSongs() {
    const api = getElectronAPI();
    if (!api?.getSongs) return [];
    return await api.getSongs();
  },

  /**
   * Open native file dialog to select audio files and import them.
   * @returns {Promise<Array>} List of newly imported songs
   */
  async selectMusicFiles() {
    const api = getElectronAPI();
    if (!api?.selectMusicFiles) return [];
    return await api.selectMusicFiles();
  },

  /**
   * Open native directory dialog to select folder and recursively import audio.
   * @returns {Promise<Array>} List of newly imported songs
   */
  async selectMusicFolder() {
    const api = getElectronAPI();
    if (!api?.selectMusicFolder) return [];
    return await api.selectMusicFolder();
  },

  /**
   * Read raw audio binary data for playback.
   * @param {string} filePath 
   * @returns {Promise<{success: boolean, data?: Uint8Array, error?: string}>}
   */
  async readMusicFile(filePath) {
    const api = getElectronAPI();
    if (!api?.readMusicFile) {
      return { success: false, error: "Electron API is not available" };
    }
    return await api.readMusicFile(filePath);
  },

  /**
   * Check if running in Electron desktop environment.
   * @returns {boolean}
   */
  isElectron() {
    return Boolean(typeof window !== "undefined" && window.electronAPI);
  },

  /**
   * Start local network sync server (Mode B).
   * @param {number} [port=3001]
   * @returns {Promise<{running: boolean, port: number, addresses: string[]}>}
   */
  async startLocalServer(port = 3001) {
    const api = getElectronAPI();
    if (!api?.startLocalServer) return { running: false, error: "Not running in Electron" };
    return await api.startLocalServer(port);
  },

  /**
   * Stop local network sync server.
   * @returns {Promise<{running: boolean}>}
   */
  async stopLocalServer() {
    const api = getElectronAPI();
    if (!api?.stopLocalServer) return { running: false };
    return await api.stopLocalServer();
  },

  /**
   * Get current local server status and addresses.
   * @returns {Promise<{running: boolean, port: number, addresses: string[]}>}
   */
  async getLocalServerStatus() {
    const api = getElectronAPI();
    if (!api?.getLocalServerStatus) return { running: false, port: 3001, addresses: [] };
    return await api.getLocalServerStatus();
  },

  /**
   * Share a song directly from local library to an active session.
   * @param {Object} params
   * @returns {Promise<{success: boolean, track?: Object, error?: string}>}
   */
  async shareSongToSession(params) {
    const api = getElectronAPI();
    if (!api?.shareSongToSession) return { success: false, error: "Not running in Electron" };
    return await api.shareSongToSession(params);
  },
};

export default musicService;
