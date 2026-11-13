import { useState, useEffect } from "react";
import userLibrary from "../services/userLibraryService";
import { formatTime } from "../utils/formatTime";

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

export function RecentlyPlayed({
  onPlaySong,
  onAddToQueue,
  currentSong,
  isPlaying,
  syncSession,
}) {
  const [librarySnapshot, setLibrarySnapshot] = useState(() => userLibrary.getSnapshot());

  useEffect(() => {
    const unsub = userLibrary.subscribe(setLibrarySnapshot);
    return unsub;
  }, []);

  const history = librarySnapshot.recentlyPlayed || [];

  return (
    <div className="page recently-played-page">
      <header className="page-header">
        <div className="header-title-row">
          <div>
            <h1>Recently Played</h1>
            <p className="muted">Tracks you've listened to recently</p>
          </div>
        </div>
      </header>

      {history.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🕒</span>
          <h3>No playback history yet</h3>
          <p className="muted">
            As you stream tracks in Online Mode, your history will appear here.
          </p>
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
                <th>Played</th>
                <th>Duration</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((track, idx) => {
                const isCur =
                  (currentSong?.id || currentSong?.streamUrl) ===
                  (track.id || track.streamUrl);
                const isLiked = userLibrary.isLiked(track.id);

                return (
                  <tr key={(track.id || "") + (track.playedAt || idx)} className={isCur ? "active-track-row" : ""}>
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
                    <td className="track-time-cell muted">
                      {formatRelativeTime(track.playedAt)}
                    </td>
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

export default RecentlyPlayed;
