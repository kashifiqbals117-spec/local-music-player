import { formatTime } from "../../utils/formatTime";

export function ProgressBar({ currentTime = 0, duration = 0, onSeek }) {
  const handleRangeChange = (event) => {
    if (onSeek) {
      onSeek(Number(event.target.value));
    }
  };

  return (
    <div className="progress-container">
      <span className="time-current">{formatTime(currentTime)}</span>

      <input
        type="range"
        className="progress-slider"
        min="0"
        max={duration || 0}
        step="0.1"
        value={currentTime}
        onChange={handleRangeChange}
        aria-label="Seek progress"
        aria-valuemin="0"
        aria-valuemax={duration || 0}
        aria-valuenow={currentTime}
      />

      <span className="time-total">{formatTime(duration)}</span>
    </div>
  );
}

export default ProgressBar;
