const Database = require("better-sqlite3");
const path = require("path");
const { app } = require("electron");

let db;

function initializeDatabase() {
  const dbPath = path.join(
    app.getPath("userData"),
    "syncbeat.db"
  );

  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT,
      album TEXT,
      genre TEXT,
      duration REAL,
      file_path TEXT UNIQUE NOT NULL
    )
  `);

  console.log("Database initialized:", dbPath);
}

function addSong(song) {
  const statement = db.prepare(`
    INSERT OR IGNORE INTO songs
    (title, artist, album, genre, duration, file_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  return statement.run(
    song.name,
    song.artist,
    song.album,
    song.genre,
    song.duration,
    song.path
  );
}

function addSongs(songs) {
  if (!songs || songs.length === 0) return;

  const statement = db.prepare(`
    INSERT OR IGNORE INTO songs
    (title, artist, album, genre, duration, file_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const song of items) {
      statement.run(
        song.name,
        song.artist,
        song.album,
        song.genre,
        song.duration,
        song.path
      );
    }
  });

  insertMany(songs);
}

function getSongs() {
  return db
    .prepare(`
      SELECT
        id,
        title AS name,
        artist,
        album,
        genre,
        duration,
        file_path AS path
      FROM songs
      ORDER BY title COLLATE NOCASE
    `)
    .all();
}

module.exports = {
  initializeDatabase,
  addSong,
  addSongs,
  getSongs,
};