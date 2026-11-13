import { useState } from "react";
import PlayerControls from "./PlayerControls";
import ProgressBar from "./ProgressBar";
import { formatTime } from "../../utils/formatTime";

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
  onPlay,
  onPause,
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
  queue = [],
  onRemoveFromQueue,
  onClearQueue,
}) {
  const [showQueue, setShowQueue] = useState(false);

  const displayTitle = currentSong?.name || currentSong?.title || sharedTrack?.title || "Nothing playing";
  const displayArtist = currentSong ? (currentSong.artist || "Unknown Artist") : (sharedTrack ? (sharedTrack.artist || "Unknown Artist") : "Select a song");
  const audioSrc = currentSong?.url || trackBlobUrl || undefined;
  const effectiveDuration = duration || sharedTrack?.duration || 0;
  const artworkUrl = currentSong?.artwork || sharedTrack?.artwork || null;
  const isOnline = currentSong?.source === "audius" || sharedTrack?.source === "audius";

  return (
    <section className="player" aria-label="Audio Player">
      {/* Audio element managed by useAudioPlayer and useSyncSession */}
      <audio
        ref={audioRef}
        src={audioSrc}
        muted={isMuted}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onError={(e) => {
          console.error("Audio error encountered:", e.currentTarget.error);
        }}
      />

      {/* Now Playing info */}
      <div className="now-playing">
        <div className="mini-art">
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt=""
              className="mini-art-img"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <span className="mini-art-icon">{isOnline ? "🌐" : "🎵"}</span>
          )}
        </div>
        <div className="now-playing-meta">
          <div className="now-playing-title-row">
            <strong title={displayTitle}>{displayTitle}</strong>
            {isOnline && (
              <span className="source-tag audius-tag" title="Streaming online via Audius">
                Online
              </span>
            )}
          </div>
          <span title={displayArtist}>{displayArtist}</span>
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
        {/* Queue Button */}
        <button
          type="button"
          className={`queue-toggle-button ${showQueue ? "active" : ""}`}
          onClick={() => setShowQueue(!showQueue)}
          title={`Listening Queue (${queue.length} track${queue.length === 1 ? "" : "s"})`}
          aria-label="Toggle listening queue"
        >
          <span>📋</span>
          {queue.length > 0 && <span className="queue-badge">{queue.length}</span>}
        </button>

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

      {/* Listening Queue Flyout Popover */}
      {showQueue && (
        <div className="queue-popover" role="dialog" aria-label="Listening Queue">
          <div className="queue-header">
            <h4>Listening Queue ({queue.length})</h4>
            <div className="queue-header-actions">
              {queue.length > 0 && onClearQueue && (
                <button type="button" className="queue-clear-button" onClick={onClearQueue}>
                  Clear
                </button>
              )}
              <button
                type="button"
                className="queue-close-button"
                onClick={() => setShowQueue(false)}
                aria-label="Close queue"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="queue-body">
            {queue.length === 0 ? (
              <p className="queue-empty">Queue is empty. Add songs from your library or Online Music.</p>
            ) : (
              <ul className="queue-list">
                {queue.map((item, idx) => (
                  <li key={`${item.id || item.path}_${idx}`} className="queue-item">
                    <span className="queue-item-index">{idx + 1}</span>
                    <div className="queue-item-art">
                      {item.artwork ? (
                        <img src={item.artwork} alt="" />
                      ) : (
                        <span>{item.source === "audius" ? "🌐" : "🎵"}</span>
                      )}
                    </div>
                    <div className="queue-item-info">
                      <strong>{item.title || item.name}</strong>
                      <small>{item.artist || "Unknown Artist"}</small>
                    </div>
                    <span className="queue-item-duration">{formatTime(item.duration)}</span>
                    {onRemoveFromQueue && (
                      <button
                        type="button"
                        className="queue-remove-button"
                        onClick={() => onRemoveFromQueue(idx)}
                        title="Remove from queue"
                        aria-label={`Remove ${item.title || item.name} from queue`}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default MusicPlayer;
