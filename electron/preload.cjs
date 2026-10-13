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
});