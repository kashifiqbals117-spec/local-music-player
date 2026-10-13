import PlayerControls from "./PlayerControls";
import ProgressBar from "./ProgressBar";

export function MusicPlayer({
  currentSong,
  isPlaying = false,
  currentTime = 0,
  duration = 0,
  onPlayPause,
  onSeek,
  onPrevious,
  onNext,
  volume = 1,
  onVolumeChange,
  isMuted = false,
  onToggleMute,
  audioRef,
  onTimeUpdate,
  onLoadedMetadata,
  onEnded,
}) {
  return (
    <section className="player" aria-label="Audio Player">
      {/* Audio element managed by useAudioPlayer */}
      <audio
        ref={audioRef}
        src={currentSong?.url}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        onError={(e) => {
          console.error("Audio error encountered:", e.currentTarget.error);
        }}
      />

      {/* Now Playing info */}
      <div className="now-playing">
        <div className="mini-art">🎵</div>
        <div className="now-playing-meta">
          <strong title={currentSong?.name || "Nothing playing"}>
            {currentSong?.name || "Nothing playing"}
          </strong>
          <span title={currentSong ? currentSong.artist : "Select a song"}>
            {currentSong ? currentSong.artist || "Unknown Artist" : "Select a song"}
          </span>
        </div>
      </div>

      {/* Center Controls & Progress */}
      <div className="player-center">
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
        />

        <PlayerControls
          isPlaying={isPlaying}
          onPlayPause={onPlayPause}
          onPrevious={onPrevious}
          onNext={onNext}
          disabled={!currentSong}
        />
      </div>

      {/* Right Side: Volume & Extra Controls */}
      <div className="player-right">
        {onToggleMute && (
          <button
            type="button"
            className="volume-button"
            onClick={onToggleMute}
            title={isMuted ? "Unmute" : "Mute"}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
          </button>
        )}

        {onVolumeChange && (
          <input
            type="range"
            className="volume-slider"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            aria-label="Volume slider"
          />
        )}
      </div>
    </section>
  );
}

export default MusicPlayer;
