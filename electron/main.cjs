const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { parseFile } = require("music-metadata");

const {
  initializeDatabase,
  addSong,
  addSongs,
  getSongs,
} = require("./database.cjs");

const {
  startServer,
  stopServer,
  getServerStatus,
  getServerInstance,
  getLocalIpAddresses,
} = require("./network-server.cjs");
const { computeFileSha256 } = require("../server/syncServer.cjs");

const SUPPORTED_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".flac",
]);

async function processAudioFile(fullPath) {
  try {
    const metadata = await parseFile(fullPath);

    return {
      name: metadata.common.title || path.basename(fullPath),
      artist: metadata.common.artist || "Unknown Artist",
      album: metadata.common.album || "Unknown Album",
      genre: metadata.common.genre?.[0] || "Unknown Genre",
      duration: metadata.format.duration || 0,
      path: fullPath,
    };
  } catch (error) {
    console.error(`Failed to read metadata for ${fullPath}:`, error);

    return {
      name: path.basename(fullPath),
      artist: "Unknown Artist",
      album: "Unknown Album",
      genre: "Unknown Genre",
      duration: 0,
      path: fullPath,
    };
  }
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadURL("http://localhost:5173");
};

ipcMain.handle("get-songs", () => {
  return getSongs();
});

ipcMain.handle("select-music-files", async () => {
  console.log("File import requested");

  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    title: "Select Music Files",
    filters: [
      {
        name: "Audio Files",
        extensions: ["mp3", "wav", "m4a", "ogg", "flac"],
      },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  const importedSongs = [];
  for (const filePath of result.filePaths) {
    const song = await processAudioFile(filePath);
    importedSongs.push(song);
  }

  addSongs(importedSongs);

  return importedSongs;
});

ipcMain.handle("select-music-folder", async () => {
  console.log("Folder import requested");

  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Select Music Folder",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  const folderPath = result.filePaths[0];
  const audioFilePaths = [];

  async function scanFolder(directory) {
    let entries;

    try {
      entries = await fs.readdir(directory, {
        withFileTypes: true,
      });
    } catch (error) {
      console.error(`Cannot read folder ${directory}:`, error);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await scanFolder(fullPath);
        continue;
      }

      if (
        entry.isFile() &&
        SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        audioFilePaths.push(fullPath);
      }
    }
  }

  await scanFolder(folderPath);

  const importedSongs = [];
  for (const filePath of audioFilePaths) {
    const song = await processAudioFile(filePath);
    importedSongs.push(song);
  }

  addSongs(importedSongs);

  return importedSongs;
});



ipcMain.handle("read-music-file", async (_, filePath) => {
  try {
    const buffer = await fs.readFile(filePath);

    return {
      data: buffer,
      success: true,
    };
  } catch (error) {
    console.error("Failed to read music file:", error);

    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle("start-local-server", async (_, port) => {
  try {
    return await startServer(port);
  } catch (err) {
    console.error("Failed to start local server:", err);
    return { running: false, error: err.message };
  }
});

ipcMain.handle("stop-local-server", async () => {
  return await stopServer();
});

ipcMain.handle("get-local-server-status", () => {
  return getServerStatus();
});

ipcMain.handle("share-song-to-session", async (_, params) => {
  const { sessionId, hostToken, songPath, title, artist, album, duration } = params || {};
  let serverInst = getServerInstance();

  // If local server is not running yet, attempt to start it
  if (!serverInst) {
    try {
      await startServer(3001);
      serverInst = getServerInstance();
    } catch (err) {
      console.warn("Could not auto-start local server:", err.message);
    }
  }

  const cleanId = (sessionId || "").toUpperCase().trim();

  // In-process handling if server instance is active and has the session
  if (serverInst && serverInst.sessionManager.hasSession(cleanId)) {
    const { sessionManager, io } = serverInst;

    if (!sessionManager.isHostAuthorized(cleanId, hostToken)) {
      return { success: false, error: "Unauthorized: host token mismatch." };
    }

    try {
      const fsSync = require("fs");
      if (!fsSync.existsSync(songPath)) {
        return { success: false, error: "Audio file does not exist on disk." };
      }

      const stat = fsSync.statSync(songPath);
      const hash = await computeFileSha256(songPath);
      const filename = path.basename(songPath);

      const trackResult = sessionManager.setTrack(cleanId, hostToken, {
        title: title || path.parse(filename).name,
        artist: artist || "Unknown Artist",
        album: album || "",
        duration: Number(duration) || 0,
        hash,
        size: stat.size,
        mimeType: "audio/mpeg",
        filename,
        filePath: songPath,
      });

      if (!trackResult.success) {
        return { success: false, error: trackResult.error };
      }

      // Notify all connected session participants
      io.to(`session_${cleanId}`).emit("track-published", {
        track: trackResult.track,
        downloadUrl: `/api/sessions/${cleanId}/track?v=${trackResult.track.version}`,
      });
      io.to(`session_${cleanId}`).emit("session-updated", sessionManager.getPublicState(cleanId));

      return {
        success: true,
        track: trackResult.track,
        downloadUrl: `/api/sessions/${cleanId}/track?v=${trackResult.track.version}`,
      };
    } catch (err) {
      console.error("Failed to share song to session:", err);
      return { success: false, error: err.message };
    }
  }

  // Fallback: try HTTP API on port 3001
  try {
    const status = getServerStatus();
    const port = status.port || 3001;
    const response = await fetch(`http://localhost:${port}/api/sessions/${cleanId}/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-host-token": hostToken || "",
      },
      body: JSON.stringify({
        localFilePath: songPath,
        title,
        artist,
        album,
        duration,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      return { success: false, error: data.error || `Server responded with ${response.status}` };
    }
    return data;
  } catch (httpErr) {
    console.error("HTTP fallback share error:", httpErr);
    return { success: false, error: "Local network server is not running or unreachable." };
  }
});

app.whenReady().then(() => {
  initializeDatabase();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", async () => {
  await stopServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});