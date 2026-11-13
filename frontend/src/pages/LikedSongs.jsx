import { useState, useEffect } from "react";
import userLibrary from "../services/userLibraryService";
import { formatTime } from "../utils/formatTime";

export function LikedSongs({
  onPlaySong,
  onAddToQueue,
  currentSong,
  isPlaying,
  syncSession,
  onNavigate,
}) {
  const [librarySnapshot, setLibrarySnapshot] = useState(() => userLibrary.getSnapshot());

  useEffect(() => {
    const unsub = userLibrary.subscribe(setLibrarySnapshot);
    userLibrary.fetchLibrary();
    return unsub;
  }, []);

  const likedTracks = librarySnapshot.likedTracks || [];

  const totalDuration = likedTracks.reduce((acc, t) => acc + (Number(t.duration) || 0), 0);

  const handlePlayAll = () => {
    if (likedTracks.length === 0) return;
    onPlaySong(likedTracks[0]);
    if (likedTracks.length > 1) {
      for (let i = 1; i < likedTracks.length; i++) {
        onAddToQueue(likedTracks[i]);
      }
    }
  };

  const handleAddAllToSession = async () => {
    if (!syncSession?.session || likedTracks.length === 0) return;
    for (const track of likedTracks) {
      await syncSession.addToSessionQueue(track);
    }
  };

  return (
    <div className="page liked-songs-page">
      <header className="liked-hero-header">
        <div className="liked-hero-artwork">
          <span>❤️</span>
        </div>
        <div className="liked-hero-meta">
          <span className="liked-hero-tag">PLAYLIST</span>
          <h1 className="liked-hero-title">Liked Songs</h1>
          <p className="liked-hero-stats">
            {likedTracks.length} {likedTracks.length === 1 ? "track" : "tracks"} • Approx. {formatTime(totalDuration)} total listening time
          </p>
          <div className="liked-hero-actions">
            <button
              type="button"
              className="liked-hero-play-btn"
              onClick={handlePlayAll}
              disabled={likedTracks.length === 0}
            >
              ▶ Play All
            </button>

            {syncSession?.session && (
              <button
                type="button"
                className="liked-hero-session-btn"
                onClick={handleAddAllToSession}
                disabled={likedTracks.length === 0}
              >
                ⚡ Add All to Session
              </button>
            )}
          </div>
        </div>
      </header>

      {likedTracks.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🤍</span>
          <h3>No liked songs yet</h3>
          <p className="muted">
            Tap the heart icon on any online track to save it to your personal collection.
          </p>
          {onNavigate && (
            <button
              type="button"
              className="add-button"
              style={{ marginTop: "1rem" }}
              onClick={() => onNavigate("online-search")}
            >
              🔍 Discover Tracks to Like
            </button>
          )}
        </div>
      ) : (
        <div className="tracks-table-wrap">
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
              {likedTracks.map((track, idx) => {
                const isCur = (currentSong?.id || currentSong?.streamUrl) === (track.id || track.streamUrl);

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
                        className="table-action-icon-btn liked"
                        onClick={() => userLibrary.toggleLike(track)}
                        title="Remove from Liked Songs"
                      >
                        ❤️
                      </button>

                      <button
                        type="button"
                        className="table-action-icon-btn"
                        onClick={() => onAddToQueue(track)}
                        title="Add to player queue"
                      >
                        ➕
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
  );
}

export default LikedSongs;
