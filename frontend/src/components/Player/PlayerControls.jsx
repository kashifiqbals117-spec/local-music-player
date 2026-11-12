export function PlayerControls({
  isPlaying = false,
  onPlayPause,
  onPrevious,
  onNext,
  disabled = false,
}) {
  return (
    <div className="controls">
      <button
        type="button"
        className="control-button prev-button"
        onClick={onPrevious}
        disabled={disabled}
        title="Previous track"
        aria-label="Previous track"
      >
        ⏮
      </button>

      <button
        type="button"
        className="play-button"
        onClick={onPlayPause}
        disabled={disabled}
        title={isPlaying ? "Pause" : "Play"}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      <button
        type="button"
        className="control-button next-button"
        onClick={onNext}
        disabled={disabled}
        title="Next track"
        aria-label="Next track"
      >
        ⏭
      </button>
    </div>
  );
}

export default PlayerControls;
