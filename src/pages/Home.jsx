import { useMemo } from "react";
import TopBar from "../components/TopBar";
import EmptyLibrary from "../components/EmptyLibrary";
import SongItem from "../components/SongItem";

export function Home({
  songs = [],
  currentSong,
  isPlaying = false,
  onPlaySong,
  onAddSongs,
  onAddFolder,
  onNavigate,
}) {
  const stats = useMemo(() => {
    const albums = new Set();
    const artists = new Set();

    for (const song of songs) {
      if (song.album) albums.add(song.album);
      if (song.artist) artists.add(song.artist);
    }

    return {
      totalSongs: songs.length,
      totalAlbums: albums.size,
      totalArtists: artists.size,
    };
  }, [songs]);

  const recentSongs = useMemo(() => {
    // Show up to 6 songs in quick overview
    return songs.slice(0, 6);
  }, [songs]);

  return (
    <div className="page home-page">
      <TopBar
        title="Welcome to SyncBeat"
        subtitle="Your lightweight, modern desktop music player"
        onAddSongs={onAddSongs}
        onAddFolder={onAddFolder}
      />

      <section className="library home-content">
        {songs.length === 0 ? (
          <EmptyLibrary
            onAddSongs={onAddSongs}
            onAddFolder={onAddFolder}
            title="Start Building Your Library"
            message="Import music files or entire folders from your computer to begin listening."
          />
        ) : (
          <>
            <div className="stats-grid">
              <div
                className="stat-card"
                onClick={() => onNavigate && onNavigate("songs")}
              >
                <div className="stat-icon">🎵</div>
                <div className="stat-info">
                  <span className="stat-value">{stats.totalSongs}</span>
                  <span className="stat-label">Total Songs</span>
                </div>
              </div>

              <div
                className="stat-card"
                onClick={() => onNavigate && onNavigate("albums")}
              >
                <div className="stat-icon">💿</div>
                <div className="stat-info">
                  <span className="stat-value">{stats.totalAlbums}</span>
                  <span className="stat-label">Albums</span>
                </div>
              </div>

              <div
                className="stat-card"
                onClick={() => onNavigate && onNavigate("artists")}
              >
                <div className="stat-icon">🎤</div>
                <div className="stat-info">
                  <span className="stat-value">{stats.totalArtists}</span>
                  <span className="stat-label">Artists</span>
                </div>
              </div>
            </div>

            <div className="home-section">
              <div className="section-header">
                <h3>Quick Picks</h3>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onNavigate && onNavigate("songs")}
                >
                  View All Songs →
                </button>
              </div>

              <div className="song-list">
                {recentSongs.map((song) => (
                  <SongItem
                    key={song.path}
                    song={song}
                    isActive={currentSong?.path === song.path}
                    isPlaying={isPlaying}
                    onPlay={onPlaySong}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default Home;
