import { useState, useEffect, useCallback } from "react";
import api from "../services/api";
import userLibrary from "../services/userLibraryService";
import { formatTime } from "../utils/formatTime";

const DISCOVER_GENRES = [
  "All",
  "Electronic",
  "Hip-Hop/Rap",
  "Pop",
  "R&B/Soul",
  "Rock",
  "Lo-Fi",
  "Ambient",
  "House",
  "Techno",
  "Trap",
];

const TIME_RANGES = [
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "all", label: "All Time" },
];

export function OnlineDiscover({
  onPlaySong,
  onAddToQueue,
  currentSong,
  isPlaying,
  syncSession,
}) {
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [selectedTime, setSelectedTime] = useState("week");
  const [trendingTracks, setTrendingTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCharts = useCallback(async (genre = selectedGenre, time = selectedTime) => {
    setIsLoading(true);
    setError(null);
    try {
      const g = genre === "All" ? undefined : genre;
      const data = await api.getTrendingMusic({ genre: g, time, limit: 30 });
      setTrendingTracks(data?.tracks || []);
    } catch (err) {
      console.error("Failed to load charts:", err);
      setError(err.message || "Failed to load music charts.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedGenre, selectedTime]);

  useEffect(() => {
    loadCharts(selectedGenre, selectedTime);
  }, [selectedGenre, selectedTime, loadCharts]);

  return (
    <div className="page online-discover-page">
      <header className="page-header">
        <div className="header-title-row">
          <div>
            <h1>Discover Online Music</h1>
            <p className="muted">Explore top trending tracks and genres worldwide on Audius</p>
          </div>

          {/* Time range selector */}
          <div className="time-range-buttons">
            {TIME_RANGES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`time-btn ${selectedTime === t.id ? "active" : ""}`}
                onClick={() => setSelectedTime(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Genre pills */}
        <div className="genre-chips-scroll">
          {DISCOVER_GENRES.map((g) => (
            <button
              key={g}
              type="button"
              className={`genre-chip ${selectedGenre === g ? "active" : ""}`}
              onClick={() => setSelectedGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </header>

      {/* Loading state */}
      {isLoading ? (
        <div className="online-loading-spinner">
          <span className="spinner">⏳</span>
          <p>Loading {selectedGenre === "All" ? "Global" : selectedGenre} charts...</p>
        </div>
      ) : error ? (
        <div className="online-error-box">
          <span>⚠️ {error}</span>
          <button type="button" className="retry-btn" onClick={() => loadCharts()}>
            Retry
          </button>
        </div>
      ) : trendingTracks.length === 0 ? (
        <div className="empty-state">
          <p>No tracks found for this genre and timeframe.</p>
        </div>
      ) : (
        <section className="discover-charts-table-wrap">
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
              {trendingTracks.map((track, idx) => {
                const isCur = (currentSong?.id || currentSong?.streamUrl) === (track.id || track.streamUrl);
                const isLiked = userLibrary.isLiked(track.id);

                return (
                  <tr key={track.id} className={isCur ? "active-track-row" : ""}>
                    <td className="rank-cell">
                      <span className={`rank-number ${idx < 3 ? `top-${idx + 1}` : ""}`}>
                        {idx + 1}
                      </span>
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
                          <span>🌐</span>
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
        </section>
      )}
    </div>
  );
}

export default OnlineDiscover;
