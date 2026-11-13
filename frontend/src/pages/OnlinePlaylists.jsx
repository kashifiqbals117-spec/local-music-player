import { useState, useEffect } from "react";
import userLibrary from "../services/userLibraryService";
import { formatTime } from "../utils/formatTime";

export function OnlinePlaylists({
  onPlaySong,
  onAddToQueue,
  currentSong,
  isPlaying,
  syncSession,
}) {
  const [librarySnapshot, setLibrarySnapshot] = useState(() => userLibrary.getSnapshot());
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);

  // New playlist modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");

  useEffect(() => {
    const unsub = userLibrary.subscribe(setLibrarySnapshot);
    userLibrary.fetchLibrary();
    return unsub;
  }, []);

  const playlists = librarySnapshot.playlists || [];

  // Default select first playlist if none selected
  const activePlaylist =
    playlists.find((p) => p.id === selectedPlaylistId) || playlists[0] || null;

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const created = await userLibrary.createPlaylist(newPlaylistName, newPlaylistDesc);
    setNewPlaylistName("");
    setNewPlaylistDesc("");
    setShowCreateModal(false);
    if (created?.id) {
      setSelectedPlaylistId(created.id);
    }
  };

  const handleDeletePlaylist = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      await userLibrary.deletePlaylist(id);
      if (selectedPlaylistId === id) {
        setSelectedPlaylistId(null);
      }
    }
  };

  const handlePlayPlaylist = (tracks) => {
    if (!tracks || tracks.length === 0) return;
    onPlaySong(tracks[0]);
    if (tracks.length > 1) {
      for (let i = 1; i < tracks.length; i++) {
        onAddToQueue(tracks[i]);
      }
    }
  };

  const handleAddPlaylistToSession = async (tracks) => {
    if (!syncSession?.session || !tracks || tracks.length === 0) return;
    for (const track of tracks) {
      await syncSession.addToSessionQueue(track);
    }
  };

  return (
    <div className="page online-playlists-page">
      <header className="page-header">
        <div className="header-title-row">
          <div>
            <h1>Your Playlists</h1>
            <p className="muted">Create and manage personal playlists synchronized across all devices</p>
          </div>
          <button
            type="button"
            className="add-button"
            onClick={() => setShowCreateModal(true)}
          >
            ➕ New Playlist
          </button>
        </div>
      </header>

      {/* Main Playlists Layout: Sidebar list + Detail view */}
      <div className="playlists-layout">
        {/* Playlists selector column */}
        <div className="playlists-sidebar-col">
          <h3 className="col-subheading">All Playlists ({playlists.length})</h3>
          <div className="playlist-nav-list">
            {playlists.map((pl) => {
              const isSelected = activePlaylist?.id === pl.id;
              return (
                <div
                  key={pl.id}
                  className={`playlist-nav-item ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedPlaylistId(pl.id)}
                >
                  <span className="pl-nav-icon">📂</span>
                  <div className="pl-nav-meta">
                    <span className="pl-nav-name">{pl.name}</span>
                    <span className="pl-nav-count">{pl.tracks?.length || 0} tracks</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Playlist Detail */}
        <div className="playlist-detail-col">
          {activePlaylist ? (
            <div>
              <div className="playlist-banner">
                <div className="playlist-banner-art">📂</div>
                <div className="playlist-banner-meta">
                  <span className="badge">PLAYLIST</span>
                  <h2>{activePlaylist.name}</h2>
                  {activePlaylist.description && (
                    <p className="playlist-banner-desc">{activePlaylist.description}</p>
                  )}
                  <p className="playlist-banner-stats">
                    {activePlaylist.tracks?.length || 0} tracks
                  </p>

                  <div className="playlist-banner-actions">
                    <button
                      type="button"
                      className="liked-hero-play-btn"
                      onClick={() => handlePlayPlaylist(activePlaylist.tracks)}
                      disabled={!activePlaylist.tracks || activePlaylist.tracks.length === 0}
                    >
                      ▶ Play All
                    </button>

                    {syncSession?.session && (
                      <button
                        type="button"
                        className="liked-hero-session-btn"
                        onClick={() => handleAddPlaylistToSession(activePlaylist.tracks)}
                        disabled={!activePlaylist.tracks || activePlaylist.tracks.length === 0}
                      >
                        ⚡ Add to Session Queue
                      </button>
                    )}

                    {activePlaylist.id !== "pl_favorites" && (
                      <button
                        type="button"
                        className="playlist-delete-btn"
                        onClick={() => handleDeletePlaylist(activePlaylist.id, activePlaylist.name)}
                      >
                        🗑 Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tracks table */}
              {!activePlaylist.tracks || activePlaylist.tracks.length === 0 ? (
                <div className="empty-state" style={{ marginTop: "2rem" }}>
                  <span className="empty-icon">🎵</span>
                  <p>This playlist is empty.</p>
                  <span className="muted">Search for online tracks and click 📂 to add them here.</span>
                </div>
              ) : (
                <div className="tracks-table-wrap" style={{ marginTop: "1.5rem" }}>
                  <table className="tracks-table">
                    <thead>
                      <tr>
                        <th style={{ width: "36px" }}>#</th>
                        <th style={{ width: "44px" }}></th>
                        <th style={{ width: "48px" }}>Art</th>
                        <th>Title</th>
                        <th>Artist</th>
                        <th>Duration</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePlaylist.tracks.map((track, idx) => {
                        const isCur =
                          (currentSong?.id || currentSong?.streamUrl) ===
                          (track.id || track.streamUrl);
                        const isLiked = userLibrary.isLiked(track.id);

                        return (
                          <tr key={track.id || idx} className={isCur ? "active-track-row" : ""}>
                            <td className="rank-cell">
                              <span className="rank-number">{idx + 1}</span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="table-play-btn"
                                onClick={() => onPlaySong(track)}
                                aria-label={`Play ${track.title}`}
                              >
                                {isCur && isPlaying ? "⏸" : "▶"}
                              </button>
                            </td>
                            <td>
                              <div className="table-art">
                                {track.artwork ? (
                                  <img src={track.artwork} alt="" loading="lazy" />
                                ) : (
                                  <span>🎵</span>
                                )}
                              </div>
                            </td>
                            <td className="track-title-cell">
                              <strong>{track.title}</strong>
                            </td>
                            <td className="track-artist-cell">{track.artist}</td>
                            <td className="track-duration-cell">{formatTime(track.duration)}</td>
                            <td className="track-actions-cell" style={{ textAlign: "right" }}>
                              <button
                                type="button"
                                className={`table-action-icon-btn ${isLiked ? "liked" : ""}`}
                                onClick={() => userLibrary.toggleLike(track)}
                                title={isLiked ? "Unlike" : "Like"}
                              >
                                {isLiked ? "❤️" : "🤍"}
                              </button>

                              <button
                                type="button"
                                className="table-action-icon-btn"
                                onClick={() => onAddToQueue(track)}
                                title="Add to player queue"
                              >
                                ➕
                              </button>

                              <button
                                type="button"
                                className="table-action-icon-btn"
                                onClick={() =>
                                  userLibrary.removeTrackFromPlaylist(activePlaylist.id, track.id)
                                }
                                title="Remove from playlist"
                              >
                                ✕
                              </button>

                              {syncSession?.session && (
                                <button
                                  type="button"
                                  className="table-session-btn"
                                  onClick={() => syncSession.addToSessionQueue(track)}
                                  title="Add to shared room queue"
                                >
                                  ⚡ Room
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <p>No playlist selected.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Playlist Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h3>Create New Playlist</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </header>
            <form onSubmit={handleCreatePlaylist} className="modal-form">
              <div className="form-group">
                <label htmlFor="pl-name">Playlist Name</label>
                <input
                  id="pl-name"
                  type="text"
                  placeholder="e.g. Synthwave Night"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="pl-desc">Description (optional)</label>
                <textarea
                  id="pl-desc"
                  placeholder="e.g. High energy tracks for late night coding"
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="folder-button"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="add-button"
                  disabled={!newPlaylistName.trim()}
                >
                  Create Playlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default OnlinePlaylists;
