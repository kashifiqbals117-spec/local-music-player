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
};

export default musicService;
