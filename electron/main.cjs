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

app.whenReady().then(() => {
  initializeDatabase();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});