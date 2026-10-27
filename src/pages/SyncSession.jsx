import { useState, useEffect, useId } from "react";
import musicService from "../services/musicService";
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
    if (!session?.id) {
      setQrCodeUrl(null);
      return;
    }

    const host = localServerStatus.addresses[0]
      ? `${localServerStatus.addresses[0]}:${localServerStatus.port || 3001}`
      : window.location.host;
    const protocol = window.location.protocol;
    const joinUrl = `${protocol}//${host}/?session=${session.id}`;

    QRCode.toDataURL(joinUrl, {
      width: 240,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).then(setQrCodeUrl).catch(console.error);
  }, [session?.id, localServerStatus]);

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

  // Create new session as Host
  const handleCreateSession = async (mode = "offline") => {
    if (unlockAudio) unlockAudio();
    try {
      setServerError(null);
      let serverHost;

      if (isElectron && mode === "offline") {
        let currentStatus = localServerStatus;
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
        serverHost = currentStatus.addresses && currentStatus.addresses[0]
          ? `http://${currentStatus.addresses[0]}:${currentStatus.port || 3001}`
          : `http://localhost:${currentStatus.port || 3001}`;
      } else {
        serverHost = localServerStatus.running && localServerStatus.addresses[0]
          ? `http://${localServerStatus.addresses[0]}:${localServerStatus.port}`
          : window.location.origin;
      }

      const res = await fetch(`${serverHost}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostName: inputName || "Host", mode }),
      });

      if (!res.ok) throw new Error("Failed to create session");
      const data = await res.json();

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

    const serverHost = localServerStatus.running && localServerStatus.addresses[0]
      ? `http://${localServerStatus.addresses[0]}:${localServerStatus.port}`
      : window.location.origin;

    joinSession({
      serverUrl: serverHost,
      sessionId: inputSessionId.toUpperCase().trim(),
      name: inputName,
    });

    if (onSetSessionId) onSetSessionId(inputSessionId.toUpperCase().trim());
  };

  // Share song from desktop library to session
  const handleShareSong = async (songToShare) => {
    if (!songToShare) return;
    if (onPlaySong && (!currentSong || currentSong.path !== songToShare.path)) {
      onPlaySong(songToShare);
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
                      <div className="track-art">🎵</div>
                      <div className="track-meta">
                        <strong>{sharedTrack.title}</strong>
                        <span>{sharedTrack.artist}</span>
                        <div className="track-badges">
                          {isTrackVerified && <span className="badge badge-verified">✔ SHA-256 Verified</span>}
                          {isTransferring && <span className="badge badge-transferring">Receiving {transferProgress}%</span>}
                          <span className="badge">{(sharedTrack.size / (1024 * 1024)).toFixed(1)} MB</span>
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
                        <button type="button" className="add-button" onClick={() => hostPlay(0)}>
                          ▶ Play Together
                        </button>
                        <button type="button" className="folder-button" onClick={hostPause}>
                          ⏸ Pause Together
                        </button>
                      </div>
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
