const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectMusicFiles: () =>
    ipcRenderer.invoke("select-music-files"),

  selectMusicFolder: () =>
    ipcRenderer.invoke("select-music-folder"),

  readMusicFile: (filePath) =>
    ipcRenderer.invoke("read-music-file", filePath),

  getSongs: () =>
    ipcRenderer.invoke("get-songs"),

  startLocalServer: (port) =>
    ipcRenderer.invoke("start-local-server", port),

  stopLocalServer: () =>
    ipcRenderer.invoke("stop-local-server"),

  getLocalServerStatus: () =>
    ipcRenderer.invoke("get-local-server-status"),

  shareSongToSession: (params) =>
    ipcRenderer.invoke("share-song-to-session", params),
});