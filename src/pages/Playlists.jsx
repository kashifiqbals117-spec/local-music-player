import { useMemo, useState } from "react";
import TopBar from "../components/TopBar";
import SongItem from "../components/SongItem";
import EmptyLibrary from "../components/EmptyLibrary";

export function Playlists({
  songs = [],
  currentSong,
  isPlaying = false,
  onPlaySong,
  onAddSongs,
  onAddFolder,
}) {
  const [activePlaylistId, setActivePlaylistId] = useState("all");

  const playlists = useMemo(() => {
    return [
      {
        id: "all",
        name: "All Tracks",
        description: "Complete collection of music files",
        icon: "📁",
        tracks: songs,
      },
      {
        id: "recent",
        name: "Recently Added",
        description: "Latest tracks imported to your player",
        icon: "✨",
        tracks: songs.slice(0, 20),
      },
      {
        id: "long",
        name: "Deep Sessions (> 5 min)",
        description: "Extended cuts and mashups",
        icon: "⏱️",
        tracks: songs.filter((s) => (s.duration || 0) > 300),
      },
      {
        id: "short",
        name: "Quick Bites (< 3 min)",
        description: "Short tracks and interludes",
        icon: "⚡",
        tracks: songs.filter((s) => (s.duration || 0) > 0 && (s.duration || 0) < 180),
      },
    ];
  }, [songs]);

  const currentPlaylist = useMemo(() => {
    return playlists.find((p) => p.id === activePlaylistId) || playlists[0];
  }, [playlists, activePlaylistId]);

  return (
    <div className="page playlists-page">
      <TopBar
        title="Playlists"
        subtitle={`${playlists.length} smart playlists available`}
        onAddSongs={onAddSongs}
        onAddFolder={onAddFolder}
      />

      <section className="library">
        {songs.length === 0 ? (
          <EmptyLibrary onAddSongs={onAddSongs} onAddFolder={onAddFolder} />
        ) : (
          <div className="playlists-layout">
            <div className="playlists-sidebar-nav">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  className={`playlist-nav-item ${
                    activePlaylistId === playlist.id ? "active" : ""
                  }`}
                  onClick={() => setActivePlaylistId(playlist.id)}
                >
                  <span className="playlist-nav-icon">{playlist.icon}</span>
                  <div className="playlist-nav-info">
                    <strong>{playlist.name}</strong>
                    <small>{playlist.tracks.length} tracks</small>
                  </div>
                </button>
              ))}
            </div>

            <div className="playlist-tracks-view">
              <div className="playlist-header-banner">
                <div className="playlist-banner-art">{currentPlaylist.icon}</div>
                <div className="playlist-banner-meta">
                  <h3>{currentPlaylist.name}</h3>
                  <p>{currentPlaylist.description}</p>
                  <small>{currentPlaylist.tracks.length} songs</small>
                  {currentPlaylist.tracks.length > 0 && (
                    <button
                      type="button"
                      className="add-button"
                      onClick={() => onPlaySong(currentPlaylist.tracks[0])}
                    >
                      ▶ Play Playlist
                    </button>
                  )}
                </div>
              </div>

              {currentPlaylist.tracks.length === 0 ? (
                <div className="empty-search">
                  <p>No tracks currently meet this playlist's criteria.</p>
                </div>
              ) : (
                <div className="song-list">
                  {currentPlaylist.tracks.map((song) => (
                    <SongItem
                      key={song.path}
                      song={song}
                      isActive={currentSong?.path === song.path}
                      isPlaying={isPlaying}
                      onPlay={onPlaySong}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default Playlists;
