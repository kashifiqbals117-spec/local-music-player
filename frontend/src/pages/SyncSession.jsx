import { useState, useEffect, useId } from "react";
import musicService from "../services/musicService";
import api from "../services/api";
import QRCode from "qrcode";

export function SyncSession({
  syncSession,
  currentSong,
  onPlaySong,
  activeSessionId,
  onSetSessionId,
  songs = [],
}) {
  const {
    session,
    myParticipant,
    connectionStatus,
    clockOffset,
    rtt,
    sharedTrack,
    transferProgress,
    isTransferring,
    transferError,
    isTrackVerified,
    isResyncing,
    resyncNotice,
    driftSeconds,
    hostToken,
    setHostToken,
    joinSession,
    requestSyncPlayback,
    hostPlay,
    hostPause,
    shareSong,
    isSharingTrack,
    shareSuccess: syncShareSuccess,
    shareError: syncShareError,
    playbackDiagnostics,
    autoplayBlocked,
    unlockAudio,
    sessionQueue = [],
    addToSessionQueue,
    removeFromSessionQueue,
    reorderSessionQueue,
    playNextInSessionQueue,
    clearSessionQueue,
  } = syncSession;

  // Local server management (Mode B)
  const [localServerStatus, setLocalServerStatus] = useState({ running: false, port: 3001, addresses: [] });
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [serverError, setServerError] = useState(null);

  // Form & selection states
  const [inputSessionId, setInputSessionId] = useState(activeSessionId || "");
  const [inputName, setInputName] = useState(() => localStorage.getItem("syncbeat_display_name") || "Guest");
  const [qrCodeUrl, setQrCodeUrl] = useState(null);
  const [selectedLibrarySongPath, setSelectedLibrarySongPath] = useState("");

  const sessionIdInputId = useId();
  const displayNameInputId = useId();

  const isElectron = musicService.isElectron();

  // Load server status on mount if running in Electron
  useEffect(() => {
    if (isElectron) {
      musicService.getLocalServerStatus().then(setLocalServerStatus).catch(console.error);
    }
  }, [isElectron]);

  // Generate QR Code when session is active
  useEffect(() => {
    if (!session?.id) return;

    let cancelled = false;
    let joinUrl;

    if (session.mode !== "online" && localServerStatus.addresses[0]) {
      // Offline local network (LAN hotspot) mode
      const lanPort = localServerStatus.port || 3001;
      joinUrl = `http://${localServerStatus.addresses[0]}:${lanPort}/?session=${session.id}`;
    } else {
      // Online cloud mode: points to public Vercel frontend
      const frontendOrigin =
        typeof window !== "undefined" && !isElectron && !window.location.hostname.includes("localhost")
          ? window.location.origin
          : "https://local-music-player-2k9z.vercel.app";
      joinUrl = `${frontendOrigin}/?session=${session.id}`;
    }

    QRCode.toDataURL(joinUrl, {
      width: 240,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrCodeUrl(url);
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.mode, localServerStatus, isElectron]);

  // Toggle local network server
  const handleToggleServer = async () => {
    setIsStartingServer(true);
    setServerError(null);
    try {
      if (localServerStatus.running) {
        await musicService.stopLocalServer();
        setLocalServerStatus({ running: false, port: 3001, addresses: [] });
      } else {
        const res = await musicService.startLocalServer(3001);
        if (res.error) {
          setServerError(res.error);
        } else {
          setLocalServerStatus(res);
        }
      }
    } catch (err) {
      setServerError(err.message);
    } finally {
      setIsStartingServer(false);
    }
  };

  // Determine server host for this client. Electron and localhost always connect via localhost loopback for offline mode, and cloud API for online mode.
  const getClientServerHost = (status, mode = "offline") => {
    const port = status?.port || 3001;
    if (isElectron || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"))) {
      if (mode === "online") {
        return api.getBaseUrl();
      }
      return `http://localhost:${port}`;
    }
    return api.getBaseUrl();
  };

  // Create new session as Host
  const handleCreateSession = async (mode = "offline") => {
    if (unlockAudio) unlockAudio();
    try {
      setServerError(null);
      let currentStatus = localServerStatus;

      if (isElectron && mode === "offline") {
        if (!currentStatus.running) {
          setIsStartingServer(true);
          const startRes = await musicService.startLocalServer(3001);
          setIsStartingServer(false);
          if (startRes.error) {
            setServerError(startRes.error);
            return;
          }
          currentStatus = startRes;
          setLocalServerStatus(startRes);
        }
      }

      const serverHost = getClientServerHost(currentStatus, mode);

      const data = await api.createSession(
        { hostName: inputName || "Host", mode },
        serverHost
      );

      setHostToken(data.hostToken);
      sessionStorage.setItem("syncbeat_host_token", data.hostToken);

      // Join the newly created session
      joinSession({
        serverUrl: serverHost,
        sessionId: data.session.id,
        name: inputName || "Host",
      });

      if (onSetSessionId) onSetSessionId(data.session.id);
    } catch (err) {
      setServerError(err.message);
    }
  };

  // Join existing session
  const handleJoinSession = (e) => {
    e.preventDefault();
    if (!inputSessionId) return;

    if (unlockAudio) unlockAudio();

    localStorage.setItem("syncbeat_display_name", inputName);

    const serverHost = getClientServerHost(localServerStatus, "online");

    joinSession({
      serverUrl: serverHost,
      sessionId: inputSessionId.toUpperCase().trim(),
      name: inputName,
    });

    if (onSetSessionId) onSetSessionId(inputSessionId.toUpperCase().trim());
  };

  // Share song from desktop library or online music to session
  const handleShareSong = async (songToShare) => {
    if (!songToShare) return;
    const isOnline = songToShare.source === "audius" || Boolean(songToShare.streamUrl);
    const songId = isOnline ? (songToShare.id || songToShare.streamUrl) : songToShare.path;
    const currentId = currentSong?.source === "audius" ? (currentSong.id || currentSong.streamUrl) : currentSong?.path;

    // Prepare track in player without starting premature uncoordinated playback
    if (onPlaySong && (!currentSong || currentId !== songId)) {
      onPlaySong(songToShare, { autoPlay: false });
    }
    if (shareSong) {
      await shareSong(songToShare);
    }
  };

  return (
    <div className="page sync-session-page">
      <header className="top-bar">
        <div className="top-bar-title-section">
          <h2>⚡ SyncBeat Sessions</h2>
          <p className="library-count">
            {connectionStatus === "connected"
              ? `Connected to Session ${session?.id || ""} • ${session?.participantCount || 1} devices in sync`
              : "Share and synchronize music with phones and computers"}
          </p>
        </div>

        {/* Resync banner */}
        {resyncNotice && (
          <div className="resync-alert-banner">
            <span className="spinner">🔄</span>
            <strong>{resyncNotice}</strong>
          </div>
        )}
      </header>

      <section className="library sync-content">
        {/* Mobile Autoplay Blocked Alert Banner */}
        {autoplayBlocked && (
          <div className="autoplay-alert-card" role="alert">
            <div className="autoplay-alert-content">
              <span className="autoplay-icon">🔇</span>
              <div>
                <strong>Audio Blocked by Mobile Browser</strong>
                <p>Mobile browsers require user interaction before playing audio in a session.</p>
              </div>
            </div>
            <button
              type="button"
              className="add-button unlock-btn"
              onClick={unlockAudio}
            >
              🔊 Tap to Enable Audio
            </button>
          </div>
        )}

        {/* Local Server Control (Mode B) */}
        {isElectron && (
          <div className="sync-card server-card">
            <div className="server-status-header">
              <div>
                <h3>Offline Local-Network Server (Mode B)</h3>
                <p className="muted">
                  Allows nearby phones and devices on the same Wi-Fi or hotspot to join without internet.
                </p>
              </div>

              <button
                type="button"
                className={`add-button ${localServerStatus.running ? "stop-btn" : ""}`}
                onClick={handleToggleServer}
                disabled={isStartingServer}
              >
                {isStartingServer
                  ? "Working..."
                  : localServerStatus.running
                  ? "Stop Local Server"
                  : "Start Local Server"}
              </button>
            </div>

            {localServerStatus.running && (
              <div className="server-addresses">
                <span className="badge badge-online">● Server Running on Port {localServerStatus.port}</span>
                <p>Nearby devices can open:</p>
                <ul>
                  {localServerStatus.addresses.map((addr) => (
                    <li key={addr}>
                      <code>http://{addr}:{localServerStatus.port}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {serverError && <p className="error-text">⚠️ {serverError}</p>}
          </div>
        )}

        {/* Active Session Display */}
        {connectionStatus === "connected" && session ? (
          <div className="active-session-container">
            {/* Top Session Stats Bar */}
            <div className="stats-grid session-stats">
              <div className="stat-card">
                <div className="stat-icon">🆔</div>
                <div className="stat-info">
                  <span className="stat-value">{session.id}</span>
                  <span className="stat-label">Session ID</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-info">
                  <span className="stat-value">{session.participantCount}</span>
                  <span className="stat-label">Devices Connected</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">⏱️</div>
                <div className="stat-info">
                  <span className="stat-value">{rtt}ms</span>
                  <span className="stat-label">Latency (RTT)</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🎯</div>
                <div className="stat-info">
                  <span className="stat-value">{Math.abs(driftSeconds).toFixed(2)}s</span>
                  <span className="stat-label">Estimated Drift</span>
                </div>
              </div>
            </div>

            {/* MANDATORY MANUAL RESYNC CONTROL BUTTON */}
            <div className="sync-playback-hero-card">
              <div className="sync-hero-info">
                <h3>Audio out of sync?</h3>
                <p>
                  Pressing <strong>SYNC PLAYBACK</strong> designates this device as the reference.
                  All connected phones and laptops will immediately pause, align to your exact position,
                  and resume at a scheduled time.
                </p>
              </div>

              <button
                type="button"
                className={`resync-button-large ${isResyncing ? "loading" : ""}`}
                onClick={requestSyncPlayback}
                disabled={isResyncing}
                title="Synchronize all devices to this device's position"
              >
                {isResyncing ? "🔄 SYNCHRONIZING..." : "⚡ SYNC PLAYBACK"}
              </button>
            </div>

            {/* Playback Timing Diagnostics */}
            <div className="sync-card diagnostics-card">
              <div className="diagnostics-header">
                <div className="diagnostics-title">
                  <span className="diag-icon">⏱️</span>
                  <h3>Playback Timing Diagnostics</h3>
                </div>
                <span className="badge badge-diag">Host vs Guest Latency Analysis</span>
              </div>
              <p className="muted">
                Measures command delivery, clock offset, audio buffer readiness, timer jitter, and startup delay.
              </p>

              {playbackDiagnostics ? (
                <div className="diagnostics-grid">
                  <div className="diag-item">
                    <span className="diag-label">Startup Delay vs Target</span>
                    <span
                      className={`diag-value ${
                        Math.abs(playbackDiagnostics.startupDelayMs) <= 35
                          ? "status-good"
                          : Math.abs(playbackDiagnostics.startupDelayMs) <= 100
                          ? "status-warn"
                          : "status-bad"
                      }`}
                    >
                      {playbackDiagnostics.startupDelayMs > 0
                        ? `+${playbackDiagnostics.startupDelayMs}ms`
                        : `${playbackDiagnostics.startupDelayMs}ms`}
                    </span>
                    <span className="diag-sub">
                      {Math.abs(playbackDiagnostics.startupDelayMs) <= 35
                        ? "🟢 Tight Sync (<35ms)"
                        : Math.abs(playbackDiagnostics.startupDelayMs) <= 100
                        ? "🟡 Acceptable"
                        : "🔴 High Latency"}
                    </span>
                  </div>

                  <div className="diag-item">
                    <span className="diag-label">Clock Offset</span>
                    <span className="diag-value">
                      {playbackDiagnostics.estimatedClockOffset > 0
                        ? `+${Math.round(playbackDiagnostics.estimatedClockOffset)}ms`
                        : `${Math.round(playbackDiagnostics.estimatedClockOffset)}ms`}
                    </span>
                    <span className="diag-sub">Server vs Device Clock</span>
                  </div>

                  <div className="diag-item">
                    <span className="diag-label">Audio Buffer Readiness</span>
                    <span
                      className={`diag-value ${
                        playbackDiagnostics.audioReadyState >= 3 ? "status-good" : "status-bad"
                      }`}
                    >
                      State {playbackDiagnostics.audioReadyState}{" "}
                      {playbackDiagnostics.audioReadyState >= 3 ? "(Ready)" : "(Buffering)"}
                    </span>
                    <span className="diag-sub">HTML5 readyState</span>
                  </div>

                  <div className="diag-item">
                    <span className="diag-label">Network RTT</span>
                    <span className="diag-value">{playbackDiagnostics.rtt}ms</span>
                    <span className="diag-sub">Round-trip latency</span>
                  </div>

                  <div className="diag-item">
                    <span className="diag-label">Timer Oversleep</span>
                    <span className="diag-value">+{playbackDiagnostics.timerOversleepMs}ms</span>
                    <span className="diag-sub">Compensated by scheduler</span>
                  </div>

                  <div className="diag-item">
                    <span className="diag-label">Position at Start</span>
                    <span className="diag-value">{playbackDiagnostics.initialPosition}s</span>
                    <span className="diag-sub">{playbackDiagnostics.timestamp}</span>
                  </div>
                </div>
              ) : (
                <div className="diagnostics-empty">
                  <p>Ready to monitor. Timing measurements will update as soon as playback begins.</p>
                  <div className="diag-preview-stats">
                    <span>
                      Clock Offset:{" "}
                      <strong>
                        {clockOffset > 0 ? `+${Math.round(clockOffset)}ms` : `${Math.round(clockOffset)}ms`}
                      </strong>
                    </span>
                    <span>
                      Current RTT: <strong>{rtt}ms</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="session-columns">
              {/* Left Column: Shared Song & Controls */}
              <div className="session-left-col">
                <div className="sync-card">
                  <h3>Now Playing in Session</h3>

                  {sharedTrack ? (
                    <div className="shared-track-details">
                      <div className="track-art">
                        {sharedTrack.artwork ? (
                          <img
                            src={sharedTrack.artwork}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
                          />
                        ) : (
                          <span>{sharedTrack.source === "audius" ? "🌐" : "🎵"}</span>
                        )}
                      </div>
                      <div className="track-meta">
                        <strong>{sharedTrack.title}</strong>
                        <span>{sharedTrack.artist}</span>
                        <div className="track-badges">
                          {sharedTrack.source === "audius" && (
                            <span className="badge badge-audius" style={{ background: "rgba(147, 51, 234, 0.25)", color: "#c084fc", border: "1px solid #a855f7" }}>
                              Audius Online
                            </span>
                          )}
                          {isTrackVerified && (
                            <span className="badge badge-verified">
                              {sharedTrack.source === "audius" ? "✔ Stream Ready" : "✔ SHA-256 Verified"}
                            </span>
                          )}
                          {isTransferring && (
                            <span className="badge badge-transferring">
                              {sharedTrack.source === "audius" ? "Buffering audio stream..." : `Receiving ${transferProgress}%`}
                            </span>
                          )}
                          {sharedTrack.size > 0 && <span className="badge">{(sharedTrack.size / (1024 * 1024)).toFixed(1)} MB</span>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="muted">No track shared yet in this session.</p>
                  )}

                  {isTransferring && (
                    <div className="transfer-progress-box">
                      <div className="progress-bar-fill" style={{ width: `${transferProgress}%` }}></div>
                    </div>
                  )}

                  {transferError && <p className="error-text">⚠️ {transferError}</p>}

                  {/* Host Quick Controls */}
                  {hostToken && (
                    <div className="host-session-controls">
                      <h4>Host Controls</h4>
                      <div className="host-buttons">
                        <button type="button" className="add-button" onClick={() => hostPlay()}>
                          ▶ Play Together
                        </button>
                        <button type="button" className="folder-button" onClick={hostPause}>
                          ⏸ Pause Together
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Shared Session Queue Card */}
                <div className="sync-card shared-queue-card">
                  <div className="shared-queue-header">
                    <div>
                      <h3>Shared Session Queue ({sessionQueue.length})</h3>
                      <p className="muted">Shared upcoming playlist synchronized across all devices</p>
                    </div>

                    {hostToken && sessionQueue.length > 0 && (
                      <div className="queue-header-actions">
                        <button
                          type="button"
                          className="add-button"
                          onClick={() => playNextInSessionQueue && playNextInSessionQueue()}
                          title="Pop and play next track across all devices"
                        >
                          ▶ Play Next
                        </button>
                        <button
                          type="button"
                          className="folder-button"
                          onClick={() => clearSessionQueue && clearSessionQueue()}
                          title="Clear shared queue"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {sessionQueue.length === 0 ? (
                    <div className="empty-queue-hint">
                      <p className="muted">The shared queue is currently empty.</p>
                      <span className="muted-sub">
                        Anyone in this room can add songs from the Songs or Online Music tabs to keep playback rolling!
                      </span>
                    </div>
                  ) : (
                    <div className="session-queue-list">
                      {sessionQueue.map((item, index) => (
                        <div key={item.queueId || index} className="session-queue-item">
                          <span className="queue-idx">{index + 1}</span>
                          <div className="queue-art">
                            {item.artwork ? (
                              <img src={item.artwork} alt="" />
                            ) : (
                              <span>{item.source === "audius" ? "🌐" : "🎵"}</span>
                            )}
                          </div>
                          <div className="queue-item-meta">
                            <strong>{item.title}</strong>
                            <span className="queue-artist-sub">{item.artist || "Unknown Artist"}</span>
                            <span className="queue-added-by">Added by {item.addedBy || "Host"}</span>
                          </div>

                          <div className="queue-item-actions">
                            {hostToken && (
                              <>
                                <button
                                  type="button"
                                  className="queue-reorder-btn"
                                  disabled={index === 0}
                                  onClick={() => reorderSessionQueue && reorderSessionQueue(index, index - 1)}
                                  title="Move Up"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  className="queue-reorder-btn"
                                  disabled={index === sessionQueue.length - 1}
                                  onClick={() => reorderSessionQueue && reorderSessionQueue(index, index + 1)}
                                  title="Move Down"
                                >
                                  ▼
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="queue-remove-btn"
                              onClick={() => removeFromSessionQueue && removeFromSessionQueue(item.queueId)}
                              title="Remove from queue"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick Add Current Song button */}
                  {currentSong && (
                    <div className="quick-add-queue-row">
                      <button
                        type="button"
                        className="quick-add-btn"
                        onClick={() => addToSessionQueue && addToSessionQueue(currentSong)}
                      >
                        ➕ Add Currently Loaded Song to Queue
                      </button>
                    </div>
                  )}
                </div>

                {/* Dedicated Share Music Card */}
                {hostToken ? (
                  <div className="sync-card share-music-card">
                    <h3>🚀 Share Music with Session</h3>
                    <p className="muted">
                      Distribute audio from your laptop library so all connected devices download, verify, and play it together.
                    </p>

                    {/* Option 1: Share Currently Loaded Song */}
                    <div className="share-option-section">
                      <h4>Option 1: Share Currently Selected Song</h4>
                      {currentSong ? (
                        <div className="current-song-share-row">
                          <div className="share-song-preview">
                            <span className="song-icon">🎵</span>
                            <div>
                              <strong>{currentSong.name}</strong>
                              <span className="muted"> — {currentSong.artist || "Unknown Artist"}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="add-button share-action-btn"
                            onClick={() => handleShareSong(currentSong)}
                            disabled={isSharingTrack}
                          >
                            {isSharingTrack ? "⏳ Sharing..." : `🚀 Share "${currentSong.name}" with Session`}
                          </button>
                        </div>
                      ) : (
                        <p className="muted empty-hint">
                          No song currently loaded in player. Select a song from below or start playback from Songs tab.
                        </p>
                      )}
                    </div>

                    {/* Option 2: Select Song from Music Library */}
                    <div className="share-option-section">
                      <h4>Option 2: Select Song from Music Library</h4>
                      {songs && songs.length > 0 ? (
                        <div className="library-share-form">
                          <select
                            className="song-select-dropdown"
                            value={selectedLibrarySongPath}
                            onChange={(e) => setSelectedLibrarySongPath(e.target.value)}
                            disabled={isSharingTrack}
                          >
                            <option value="">-- Choose a song to share --</option>
                            {songs.map((song) => (
                              <option key={song.path} value={song.path}>
                                {song.name} — {song.artist || "Unknown Artist"} {song.duration ? `(${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, "0")})` : ""}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="add-button share-action-btn"
                            onClick={() => {
                              const songToShare = songs.find((s) => s.path === selectedLibrarySongPath);
                              if (songToShare) {
                                handleShareSong(songToShare);
                              }
                            }}
                            disabled={!selectedLibrarySongPath || isSharingTrack}
                          >
                            {isSharingTrack ? "⏳ Sharing..." : "🚀 Share Selected Song"}
                          </button>
                        </div>
                      ) : (
                        <p className="muted empty-hint">
                          No songs found in local library. Go to the Songs tab to import music files.
                        </p>
                      )}
                    </div>

                    {/* Status feedback */}
                    {isSharingTrack && (
                      <div className="share-status-loading">
                        <span className="spinner">⏳</span>
                        <span>Preparing audio file and notifying session participants...</span>
                      </div>
                    )}
                    {syncShareSuccess && <p className="success-text">✔ {syncShareSuccess}</p>}
                    {syncShareError && <p className="error-text">⚠️ {syncShareError}</p>}
                  </div>
                ) : (
                  <div className="sync-card guest-role-card">
                    <h3>🎧 Guest Device</h3>
                    <p className="muted">
                      You are connected as a participant. When the session host shares a song, it will automatically download and prepare for synchronized playback.
                    </p>
                  </div>
                )}

                {/* QR Code Card */}
                {qrCodeUrl && (
                  <div className="sync-card qr-card">
                    <h3>Invite Friends with QR Code</h3>
                    <p className="muted">Scan with any phone camera to join instantly in browser:</p>
                    <img src={qrCodeUrl} alt="Session QR Code" className="qr-image" />
                    <code className="session-url-text">Session ID: {session.id}</code>

                    <button
                      type="button"
                      className="add-button copy-link-btn"
                      style={{ marginTop: "0.75rem", width: "100%" }}
                      onClick={() => {
                        const url =
                          session.mode !== "online" && localServerStatus.addresses[0]
                            ? `http://${localServerStatus.addresses[0]}:${localServerStatus.port || 3001}/?session=${session.id}`
                            : `https://local-music-player-2k9z.vercel.app/?session=${session.id}`;
                        navigator.clipboard?.writeText(url);
                        alert(`Invite link copied to clipboard:\n${url}`);
                      }}
                    >
                      📋 Copy Invite Link
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Participant Device List */}
              <div className="session-right-col">
                <div className="sync-card">
                  <h3>Connected Participants ({session.participants?.length || 0})</h3>

                  <div className="participants-list">
                    {session.participants?.map((p) => (
                      <div key={p.id} className={`participant-item ${p.id === myParticipant?.id ? "self" : ""}`}>
                        <div className="participant-avatar">
                          {p.isHost ? "👑" : "📱"}
                        </div>
                        <div className="participant-info">
                          <strong>
                            {p.name} {p.id === myParticipant?.id ? "(You)" : ""}
                          </strong>
                          <span className="participant-sub">
                            {p.isReady ? "🟢 Ready" : "🟡 Buffering"} • {p.connected ? "Connected" : "Disconnected"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Join / Create Session Setup Screen */
          <div className="session-setup-container">
            <div className="sync-card setup-card">
              <h3>Create or Join a Session</h3>
              <p className="muted">
                SyncBeat coordinates playback so devices play together like a shared speaker system.
              </p>

              <form onSubmit={handleJoinSession} className="session-form">
                <div className="form-group">
                  <label htmlFor={displayNameInputId}>Your Name / Device Name:</label>
                  <input
                    id={displayNameInputId}
                    type="text"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    placeholder="e.g. Alex (Phone)"
                    maxLength={24}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor={sessionIdInputId}>Enter Session ID to Join:</label>
                  <div className="join-input-row">
                    <input
                      id={sessionIdInputId}
                      type="text"
                      value={inputSessionId}
                      onChange={(e) => setInputSessionId(e.target.value.toUpperCase())}
                      placeholder="e.g. 8K2M9X"
                      maxLength={8}
                    />
                    <button type="submit" className="add-button">
                      Join Session
                    </button>
                  </div>
                </div>
              </form>

              <div className="divider-line">
                <span>OR</span>
              </div>

              <div className="create-session-box">
                <h4>Host a New Session</h4>
                <div className="create-buttons">
                  <button
                    type="button"
                    className="add-button host-btn"
                    onClick={() => handleCreateSession("offline")}
                  >
                    ⚡ Create Offline Wi-Fi Session
                  </button>

                  <button
                    type="button"
                    className="folder-button host-btn"
                    onClick={() => handleCreateSession("online")}
                  >
                    🌐 Create Online Session
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default SyncSession;
