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
  isSessionActive = false,
  onSyncPlayback,
  isResyncing = false,
  onShareCurrentSong,
  isSharingTrack = false,
  shareSuccess = null,
  isHost = true,
  sharedTrack = null,
  trackBlobUrl = null,
}) {
  const displayTitle = currentSong?.name || sharedTrack?.title || "Nothing playing";
  const displayArtist = currentSong ? (currentSong.artist || "Unknown Artist") : (sharedTrack ? (sharedTrack.artist || "Unknown Artist") : "Select a song");
  const audioSrc = currentSong?.url || trackBlobUrl || undefined;
  const effectiveDuration = duration || sharedTrack?.duration || 0;

  return (
    <section className="player" aria-label="Audio Player">
      {/* Audio element managed by useAudioPlayer and useSyncSession */}
      <audio
        ref={audioRef}
        src={audioSrc}
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
          <strong title={displayTitle}>
            {displayTitle}
          </strong>
          <span title={displayArtist}>
            {displayArtist}
          </span>
        </div>
      </div>

      {/* Center Controls & Progress */}
      <div className="player-center">
        <ProgressBar
          currentTime={currentTime}
          duration={effectiveDuration}
          onSeek={onSeek}
        />

        <PlayerControls
          isPlaying={isPlaying}
          onPlayPause={onPlayPause}
          onPrevious={onPrevious}
          onNext={onNext}
          disabled={!currentSong && !sharedTrack}
        />
      </div>

      {/* Right Side: Volume & Extra Controls */}
      <div className="player-right">
        {/* Share with Session Button (Visible when session is active) */}
        {isSessionActive && onShareCurrentSong && isHost && (
          <button
            type="button"
            className={`share-mini-button ${isSharingTrack ? "loading" : ""} ${shareSuccess ? "success" : ""}`}
            onClick={() => onShareCurrentSong(currentSong)}
            disabled={!currentSong || isSharingTrack}
            title={!currentSong ? "Select or play a song to share with session" : `Share "${currentSong.name}" with session`}
          >
            {isSharingTrack ? "⏳ SHARING..." : shareSuccess ? "✔ SHARED!" : "🚀 SHARE WITH SESSION"}
          </button>
        )}

        {isSessionActive && onSyncPlayback && (
          <button
            type="button"
            className={`resync-mini-button ${isResyncing ? "loading" : ""}`}
            onClick={onSyncPlayback}
            disabled={isResyncing}
            title="Designate this device as reference and align all devices (SYNC PLAYBACK)"
          >
            {isResyncing ? "🔄 SYNCING..." : "⚡ SYNC PLAYBACK"}
          </button>
        )}

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
