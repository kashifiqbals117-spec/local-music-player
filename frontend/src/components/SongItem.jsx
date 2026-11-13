import { formatTime } from "../utils/formatTime";

export function SongItem({
  song,
  isActive = false,
  isPlaying = false,
  onPlay,
  onAddToQueue,
  onAddToSessionQueue,
  isSessionActive = false,
}) {
  const handlePlayClick = (e) => {
    e.stopPropagation();
    onPlay(song);
  };

  const handleQueueClick = (e) => {
    e.stopPropagation();
    if (onAddToQueue) onAddToQueue(song);
  };

  const handleSessionQueueClick = (e) => {
    e.stopPropagation();
    if (onAddToSessionQueue) onAddToSessionQueue(song);
  };

  return (
    <div
      className={`song ${isActive ? "active" : ""}`}
      onClick={() => onPlay(song)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPlay(song);
        }
      }}
      aria-label={`Play ${song.name} by ${song.artist || "Unknown Artist"}`}
    >
      <div className="song-icon">
        {isActive && isPlaying ? "🔊" : "🎵"}
      </div>

      <div className="song-info">
        <strong>{song.name}</strong>
        <span>
          {song.artist || "Unknown Artist"} • {song.album || "Unknown Album"}
        </span>
        <small className="song-duration">
          {formatTime(song.duration)}
        </small>
      </div>

      <div className="song-actions-row">
        {onAddToQueue && (
          <button
            type="button"
            className="song-item-action-btn"
            onClick={handleQueueClick}
            title="Add to player queue"
          >
            ➕
          </button>
        )}

        {isSessionActive && onAddToSessionQueue && (
          <button
            type="button"
            className="song-item-session-btn"
            onClick={handleSessionQueueClick}
            title="Add to shared room queue"
          >
            ⚡ Room
          </button>
        )}

        <button
          className="song-play"
          onClick={handlePlayClick}
          type="button"
          title={isActive && isPlaying ? "Playing" : "Play"}
          aria-label={isActive && isPlaying ? "Playing" : "Play"}
        >
          {isActive && isPlaying ? "⏸" : "▶"}
        </button>
      </div>
    </div>
  );
}

export default SongItem;
