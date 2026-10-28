import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import musicService from "../services/musicService";

/**
 * Compute SHA-256 of an ArrayBuffer in browser.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
async function computeBrowserSha256(buffer) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "";
}

/**
 * Pre-buffers audio pipeline and waits for canplay / canplaythrough
 * (readyState >= 3: HAVE_FUTURE_DATA) before declaring the device ready.
 * @param {HTMLAudioElement|null} audio
 * @param {string} blobUrl
 * @returns {Promise<boolean>}
 */
async function prepareAudioElement(audio, blobUrl) {
  if (!audio) return false;
  return new Promise((resolve) => {
    // If readyState is already HAVE_FUTURE_DATA (3) or HAVE_ENOUGH_DATA (4)
    if (audio.readyState >= 3 && audio.src === blobUrl) {
      return resolve(true);
    }

    let resolved = false;
    let timeoutId = null;

    const cleanup = () => {
      clearTimeout(timeoutId);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("canplaythrough", onCanPlay);
      audio.removeEventListener("error", onError);
    };

    const onCanPlay = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(true);
    };

    const onError = (e) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      console.warn("[SyncBeat] Audio pre-buffering error:", e);
      resolve(false);
    };

    audio.addEventListener("canplay", onCanPlay, { once: true });
    audio.addEventListener("canplaythrough", onCanPlay, { once: true });
    audio.addEventListener("error", onError, { once: true });

    timeoutId = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(audio.readyState >= 1);
    }, 6000);

    if (audio.src !== blobUrl) {
      audio.src = blobUrl;
    }
  });
}

/**
 * High-precision two-phase scheduler.
 * Uses coarse timeout to sleep for majority of wait, then transitions to
 * micro-polling / requestAnimationFrame to eliminate mobile timer throttling delays.
 * @param {number} targetWallTime - Target Date.now() timestamp
 * @param {(lateMs: number) => void} onExecute
 * @returns {{ cancel: () => void }}
 */
function schedulePreciseAction(targetWallTime, onExecute) {
  const nowWall = Date.now();
  const delayMs = targetWallTime - nowWall;

  if (delayMs <= 0) {
    onExecute(-delayMs);
    return { cancel: () => {} };
  }

  let timerId = null;
  let frameId = null;
  let isCancelled = false;

  // Sleep for majority of duration, waking up ~25ms early
  const coarseDelay = Math.max(0, delayMs - 25);

  const runFinePolling = () => {
    if (isCancelled) return;

    const step = () => {
      if (isCancelled) return;
      const current = Date.now();
      if (current >= targetWallTime) {
        const lateMs = current - targetWallTime;
        onExecute(lateMs);
      } else if (targetWallTime - current > 12) {
        timerId = setTimeout(step, 4);
      } else if (typeof requestAnimationFrame !== "undefined") {
        frameId = requestAnimationFrame(step);
      } else {
        timerId = setTimeout(step, 1);
      }
    };
    step();
  };

  timerId = setTimeout(runFinePolling, coarseDelay);

  return {
    cancel: () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
      if (frameId && typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(frameId);
      }
    },
  };
}

export function useSyncSession({ audioRef, onLocalPlay, onLocalPause, onLocalSeek }) {
  const [socket, setSocket] = useState(null);
  const [session, setSession] = useState(null);
  const [myParticipant, setMyParticipant] = useState(null);
  const [clientToken, setClientToken] = useState(() => localStorage.getItem("syncbeat_client_token") || null);
  const [hostToken, setHostToken] = useState(() => sessionStorage.getItem("syncbeat_host_token") || null);

  const [connectionStatus, setConnectionStatus] = useState("disconnected"); // 'disconnected'|'connecting'|'connected'
  const [clockOffset, setClockOffset] = useState(0); // localTime = serverTime - offset
  const [rtt, setRtt] = useState(0);

  const [sharedTrack, setSharedTrack] = useState(null);
  const [trackBlobUrl, setTrackBlobUrl] = useState(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState(null);
  const [isTrackVerified, setIsTrackVerified] = useState(false);

  // Diagnostics and Autoplay states
  const [playbackDiagnostics, setPlaybackDiagnostics] = useState(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Sharing state
  const [isSharingTrack, setIsSharingTrack] = useState(false);
  const [shareError, setShareError] = useState(null);
  const [shareSuccess, setShareSuccess] = useState(null);
  const serverUrlRef = useRef("");

  // Manual Resync & Drift states
  const [resyncState, setResyncState] = useState(null); // active resync info
  const [resyncNotice, setResyncNotice] = useState(null); // feedback banner
  const [isResyncing, setIsResyncing] = useState(false);
  const [driftSeconds, setDriftSeconds] = useState(0);

  const socketRef = useRef(null);
  const preciseActionRef = useRef(null);
  const clockOffsetRef = useRef(0);
  clockOffsetRef.current = clockOffset;
  const rttRef = useRef(0);
  rttRef.current = rtt;

  const hostTokenRef = useRef(hostToken);
  useEffect(() => {
    hostTokenRef.current = hostToken;
  }, [hostToken]);

  const loadedTrackRef = useRef({ id: null, version: null });
  const isDownloadingRef = useRef(false);

  // History buffer for minimum-RTT NTP filtering
  const syncHistoryRef = useRef([]);

  // Cleanup Blob URL on unmount or new track
  const currentBlobUrlRef = useRef(null);
  const setBlobUrlSafe = (url) => {
    if (currentBlobUrlRef.current && currentBlobUrlRef.current !== url) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
    }
    currentBlobUrlRef.current = url;
    setTrackBlobUrl(url);
  };

  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
      }
      if (preciseActionRef.current) {
        preciseActionRef.current.cancel();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Multi-sample NTP clock synchronization with minimum-RTT filtering
  const performClockSync = useCallback((sock, burstCount = 1) => {
    if (!sock || !sock.connected) return;

    let sampleIndex = 0;

    const takeSample = () => {
      if (!sock.connected) return;

      const p0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      const t0 = Date.now();

      sock.emit("time-sync", { clientSendTime: t0 }, (res) => {
        if (!res) return;
        const p3 = typeof performance !== "undefined" ? performance.now() : Date.now();
        const t3 = Date.now();

        const totalTripMs = Math.max(0, p3 - p0);
        const serverProcMs = Math.max(0, (res.serverSendTime || 0) - (res.serverReceiveTime || 0));
        const roundTrip = Math.max(0, totalTripMs - serverProcMs);

        // Standard NTP: offset = ((t1 - t0) + (t2 - t3)) / 2
        // Represents: serverTime - clientTime
        const offset = ((res.serverReceiveTime - t0) + (res.serverSendTime - t3)) / 2;

        const history = syncHistoryRef.current;
        history.push({ offset, rtt: roundTrip, at: Date.now() });
        if (history.length > 10) history.shift();

        // Minimum-RTT filter: packet with lowest RTT has least network queuing jitter
        const sorted = [...history].sort((a, b) => a.rtt - b.rtt);
        const bestSample = sorted[0];

        // Filter: pick samples whose RTT is close to bestSample (<= bestSample.rtt * 1.8 + 6)
        const validSamples = sorted.filter((s) => s.rtt <= bestSample.rtt * 1.8 + 6);

        // Compute median offset
        validSamples.sort((a, b) => a.offset - b.offset);
        const medianOffset = validSamples[Math.floor(validSamples.length / 2)].offset;

        setRtt(Math.round(bestSample.rtt));
        rttRef.current = Math.round(bestSample.rtt);
        setClockOffset(medianOffset);
        clockOffsetRef.current = medianOffset;

        sampleIndex++;
        if (sampleIndex < burstCount) {
          setTimeout(takeSample, 100);
        }
      });
    };

    takeSample();
  }, []);

  // Connect to a session
  const joinSession = useCallback(({ serverUrl = "", sessionId, name = "Listener" }) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const cleanSessionId = (sessionId || "").toUpperCase().trim();
    if (!cleanSessionId) return;

    serverUrlRef.current = serverUrl;
    setConnectionStatus("connecting");

    const defaultHost = (() => {
      if (musicService.isElectron()) {
        return "http://localhost:3001";
      }
      if (typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
        return window.location.origin;
      }
      return "http://localhost:3001";
    })();

    const targetUrl = serverUrl || defaultHost;
    const sock = io(targetUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = sock;
    setSocket(sock);

    // Helper to download, verify SHA-256, and pre-buffer a track
    const downloadAndVerifyTrack = async ({ track, downloadUrl } = {}) => {
      if (!track || isDownloadingRef.current) return;
      if (
        loadedTrackRef.current &&
        loadedTrackRef.current.id === track.id &&
        loadedTrackRef.current.version === track.version
      ) {
        return;
      }

      setSharedTrack(track);

      // If this device is the session host, avoid re-fetching over HTTP to maintain uninterrupted local playback.
      if (hostTokenRef.current) {
        setIsTrackVerified(true);
        setIsTransferring(false);
        setTransferProgress(100);
        loadedTrackRef.current = { id: track.id, version: track.version };
        sock.emit("track-ready-ack", {
          sessionId: cleanSessionId,
          isReady: true,
        });
        return;
      }

      isDownloadingRef.current = true;
      setIsTrackVerified(false);
      setTransferProgress(0);
      setIsTransferring(true);
      setTransferError(null);

      try {
        const pathUrl = downloadUrl || `/api/sessions/${cleanSessionId}/track?v=${track.version || 0}`;
        const base = targetUrl || defaultHost;
        const fullDownloadUrl = base ? `${base.replace(/\/$/, "")}${pathUrl}` : pathUrl;

        // Fetch track with download progress
        const response = await fetch(fullDownloadUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to download audio file (${response.status})`);
        }

        const totalBytes = Number(response.headers.get("content-length")) || track.size || 0;
        const reader = response.body?.getReader();

        let receivedBytes = 0;
        let chunks = [];

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedBytes += value.length;
            if (totalBytes > 0) {
              setTransferProgress(Math.min(100, Math.round((receivedBytes / totalBytes) * 100)));
            }
          }
        }

        const totalBuffer = new Uint8Array(receivedBytes);
        let offset = 0;
        for (const chunk of chunks) {
          totalBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        // SHA-256 integrity verification
        const computedHash = await computeBrowserSha256(totalBuffer.buffer);
        if (track.hash && computedHash && computedHash !== track.hash) {
          throw new Error("SHA-256 checksum mismatch! The file may be corrupt.");
        }

        loadedTrackRef.current = { id: track.id, version: track.version };
        setIsTrackVerified(true);
        setIsTransferring(false);
        setTransferProgress(100);

        const blob = new Blob([totalBuffer], { type: track.mimeType || "audio/mpeg" });
        const blobUrl = URL.createObjectURL(blob);
        setBlobUrlSafe(blobUrl);

        // Pre-buffer audio pipeline and wait until canplay / canplaythrough
        const audioReady = await prepareAudioElement(audioRef?.current, blobUrl);
        if (audioRef?.current) {
          audioRef.current.currentTime = 0;
        }

        console.log(
          `[SyncBeat Audio Timing] Track verified & audio pipeline ready (readyState: ${audioRef?.current?.readyState || 0})`
        );

        // Only notify server that track is ready when audio element is actually ready to play
        sock.emit("track-ready-ack", {
          sessionId: cleanSessionId,
          isReady: audioReady,
        });
      } catch (err) {
        console.error("Track download error:", err);
        setIsTransferring(false);
        setTransferError(err.message);
      } finally {
        isDownloadingRef.current = false;
      }
    };

    sock.on("connect", () => {
      setConnectionStatus("connected");
      // Initial burst of 4 clock-sync samples for rapid precision convergence
      performClockSync(sock, 4);

      const savedPartId = localStorage.getItem(`syncbeat_part_${cleanSessionId}`);
      const savedToken = localStorage.getItem(`syncbeat_tok_${cleanSessionId}`);

      sock.emit("join-session", {
        sessionId: cleanSessionId,
        name,
        participantId: savedPartId,
        clientToken: savedToken,
      }, async (res) => {
        if (res?.success) {
          setSession(res.session);
          setMyParticipant(res.participant);
          if (res.clientToken) {
            setClientToken(res.clientToken);
            localStorage.setItem(`syncbeat_part_${cleanSessionId}`, res.participant.id);
            localStorage.setItem(`syncbeat_tok_${cleanSessionId}`, res.clientToken);
          }
          // Late joiner support: immediately download and prepare track if session already has a track
          if (res.session?.currentTrack && !hostTokenRef.current) {
            await downloadAndVerifyTrack({
              track: res.session.currentTrack,
              downloadUrl: `/api/sessions/${cleanSessionId}/track?v=${res.session.currentTrack.version || 0}`,
            });
          }
        } else {
          setConnectionStatus("error");
          setTransferError(res?.error || "Failed to join session.");
        }
      });
    });

    sock.on("disconnect", () => {
      setConnectionStatus("disconnected");
    });

    sock.on("session-updated", async (updatedState) => {
      setSession(updatedState);
      // If a track is present on the session and we haven't loaded this track version yet, download it
      if (
        updatedState?.currentTrack &&
        !hostTokenRef.current &&
        (!loadedTrackRef.current ||
          loadedTrackRef.current.id !== updatedState.currentTrack.id ||
          loadedTrackRef.current.version !== updatedState.currentTrack.version)
      ) {
        await downloadAndVerifyTrack({
          track: updatedState.currentTrack,
          downloadUrl: `/api/sessions/${cleanSessionId}/track?v=${updatedState.currentTrack.version || 0}`,
        });
      }
    });

    // Handle track published by host
    sock.on("track-published", async ({ track, downloadUrl }) => {
      await downloadAndVerifyTrack({ track, downloadUrl });
    });

    // Playback commands from server
    sock.on("playback-command", ({ type, position, scheduledAt }) => {
      const currentOffset = clockOffsetRef.current;
      const localScheduledTime = scheduledAt - currentOffset;

      if (preciseActionRef.current) {
        preciseActionRef.current.cancel();
      }

      if (type === "pause") {
        if (audioRef?.current) {
          audioRef.current.pause();
          if (Number.isFinite(position)) {
            audioRef.current.currentTime = position;
          }
        }
        if (onLocalPause) onLocalPause(position);
      } else if (type === "play") {
        // Step 1: Pre-seek and pre-buffer immediately upon receiving command
        // This ensures the browser's audio decoder is already positioned and primed
        if (audioRef?.current && Number.isFinite(position)) {
          if (Math.abs(audioRef.current.currentTime - position) > 0.05) {
            audioRef.current.currentTime = position;
          }
        }

        // Step 2: High-precision schedule to target time
        preciseActionRef.current = schedulePreciseAction(localScheduledTime, async (lateMs) => {
          if (audioRef?.current) {
            const audio = audioRef.current;
            const playInvokeTime = Date.now();

            // If timer woke up noticeably late (>25ms), compensate position so we don't start in the past
            if (lateMs > 25 && Number.isFinite(position)) {
              audio.currentTime = position + (lateMs / 1000);
            }

            // Instrument true playback start time via 'playing' event
            const onPlaying = () => {
              audio.removeEventListener("playing", onPlaying);
              const actualStartWall = Date.now();
              const startupDelayMs = actualStartWall - localScheduledTime;
              const posAfterStart = audio.currentTime;

              const diag = {
                commandType: "play",
                requestedScheduledAt: scheduledAt,
                localScheduledAt: localScheduledTime,
                estimatedClockOffset: currentOffset,
                rtt: rttRef.current,
                timerOversleepMs: Math.round(lateMs),
                audioPlayInvokedAt: playInvokeTime,
                actualAudioStartedAt: actualStartWall,
                startupDelayMs: Math.round(startupDelayMs),
                initialPosition: Number(posAfterStart.toFixed(3)),
                audioReadyState: audio.readyState,
                timestamp: new Date().toLocaleTimeString(),
              };

              console.log(
                `[SyncBeat Audio Timing] Started playback. Target delay: ${diag.startupDelayMs > 0 ? "+" : ""}${diag.startupDelayMs}ms | Audio readyState: ${diag.audioReadyState} | Clock offset: ${Math.round(diag.estimatedClockOffset)}ms | Pos: ${diag.initialPosition}s`
              );

              setPlaybackDiagnostics(diag);
            };

            audio.addEventListener("playing", onPlaying, { once: true });

            try {
              await audio.play();
              setAutoplayBlocked(false);
            } catch (err) {
              console.warn("[SyncBeat] Audio play prevented by browser autoplay policy:", err.message);
              if (err.name === "NotAllowedError") {
                setAutoplayBlocked(true);
              }
            }
          }
          if (onLocalPlay) onLocalPlay(position);
        });
      } else if (type === "seek") {
        if (audioRef?.current && Number.isFinite(position)) {
          audioRef.current.currentTime = position;
        }
        if (onLocalSeek) onLocalSeek(position);
      }
    });

    /* ======================================================================
       MANUAL RESYNC PROTOCOL (SYNC PLAYBACK)
       ====================================================================== */

    // Step 7-8: Server broadcasts RESYNC_BEGIN
    sock.on("resync-begin", ({ opId, referenceParticipantId, referenceName, position, timeoutMs }) => {
      setIsResyncing(true);
      setResyncState({ opId, referenceName, position });
      setResyncNotice(`Pausing devices to align with ${referenceName} at ${position.toFixed(1)}s...`);

      // All devices pause immediately
      if (audioRef?.current) {
        audioRef.current.pause();
        // Step 10: Align position to reference device
        audioRef.current.currentTime = position;
      }
      if (onLocalPause) onLocalPause(position);

      // Step 11: Acknowledge readiness
      sock.emit("resync-ack", {
        sessionId: cleanSessionId,
        opId,
        ready: true,
        position,
      });
    });

    // Step 15-16: Server broadcasts RESYNC_COMMIT with scheduled resume
    sock.on("resync-commit", ({ opId, position, scheduledResumeAt, state, referenceName, unreadyParticipants }) => {
      const currentOffset = clockOffsetRef.current;
      const localScheduledTime = scheduledResumeAt - currentOffset;

      let noticeText = `Playback synchronized with ${referenceName}!`;
      if (unreadyParticipants && unreadyParticipants.length > 0) {
        noticeText += ` (${unreadyParticipants.join(", ")} not ready)`;
      }
      setResyncNotice(noticeText);

      if (preciseActionRef.current) {
        preciseActionRef.current.cancel();
      }

      if (state === "playing") {
        // Pre-seek immediately upon receiving resync commit
        if (audioRef?.current && Number.isFinite(position)) {
          if (Math.abs(audioRef.current.currentTime - position) > 0.05) {
            audioRef.current.currentTime = position;
          }
        }

        preciseActionRef.current = schedulePreciseAction(localScheduledTime, async (lateMs) => {
          if (audioRef?.current) {
            const audio = audioRef.current;
            const playInvokeTime = Date.now();

            if (lateMs > 25 && Number.isFinite(position)) {
              audio.currentTime = position + (lateMs / 1000);
            }

            const onPlaying = () => {
              audio.removeEventListener("playing", onPlaying);
              const actualStartWall = Date.now();
              const startupDelayMs = actualStartWall - localScheduledTime;
              const posAfterStart = audio.currentTime;

              const diag = {
                commandType: "resync-commit",
                requestedScheduledAt: scheduledResumeAt,
                localScheduledAt: localScheduledTime,
                estimatedClockOffset: currentOffset,
                rtt: rttRef.current,
                timerOversleepMs: Math.round(lateMs),
                audioPlayInvokedAt: playInvokeTime,
                actualAudioStartedAt: actualStartWall,
                startupDelayMs: Math.round(startupDelayMs),
                initialPosition: Number(posAfterStart.toFixed(3)),
                audioReadyState: audio.readyState,
                timestamp: new Date().toLocaleTimeString(),
              };

              console.log(
                `[SyncBeat Audio Timing] Resync resume. Target delay: ${diag.startupDelayMs > 0 ? "+" : ""}${diag.startupDelayMs}ms | Clock offset: ${Math.round(diag.estimatedClockOffset)}ms`
              );

              setPlaybackDiagnostics(diag);
            };

            audio.addEventListener("playing", onPlaying, { once: true });

            try {
              await audio.play();
              setAutoplayBlocked(false);
            } catch (err) {
              console.warn("[SyncBeat] Resync play prevented by autoplay policy:", err.message);
              if (err.name === "NotAllowedError") {
                setAutoplayBlocked(true);
              }
            }
          }
          if (onLocalPlay) onLocalPlay(position);
          setIsResyncing(false);
          setTimeout(() => setResyncNotice(null), 3500);
        });
      } else {
        setIsResyncing(false);
        setTimeout(() => setResyncNotice(null), 3500);
      }
    });

    sock.on("resync-error", ({ message }) => {
      setIsResyncing(false);
      setResyncNotice(`Sync notice: ${message}`);
      setTimeout(() => setResyncNotice(null), 4000);
    });

    sock.on("participant-kicked", ({ participantId }) => {
      if (participantId === myParticipant?.id) {
        setConnectionStatus("kicked");
        sock.disconnect();
      }
    });
  }, [audioRef, onLocalPlay, onLocalPause, onLocalSeek, performClockSync, myParticipant?.id]);

  // Periodic clock sync and drift telemetry
  useEffect(() => {
    if (!socket || connectionStatus !== "connected" || !session) return;

    const interval = setInterval(() => {
      performClockSync(socket);

      // Calculate drift relative to server playback
      if (audioRef?.current && session.playback?.state === "playing") {
        const localPos = audioRef.current.currentTime;
        const elapsed = (Date.now() - (session.playback.updatedAt - clockOffsetRef.current)) / 1000;
        const expectedServerPos = session.playback.position + Math.max(0, elapsed);
        const drift = localPos - expectedServerPos;
        setDriftSeconds(drift);

        socket.emit("playback-telemetry", {
          sessionId: session.id,
          position: localPos,
          isPlaying: !audioRef.current.paused,
          drift,
          rtt: rttRef.current,
        });
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [socket, connectionStatus, session, performClockSync, audioRef]);

  // User presses SYNC PLAYBACK
  const requestSyncPlayback = useCallback(() => {
    if (!socket || !session || isResyncing) return;

    const currentPos = audioRef?.current ? audioRef.current.currentTime : 0;
    const isPlaying = audioRef?.current ? !audioRef.current.paused : true;

    setIsResyncing(true);
    setResyncNotice("Requesting synchronization for all devices...");

    socket.emit("request-resync", {
      sessionId: session.id,
      trackId: sharedTrack?.id || session.currentTrack?.id,
      position: currentPos,
      isPlaying,
    }, (res) => {
      if (!res?.success) {
        setIsResyncing(false);
        setResyncNotice(res?.error || "Resync request failed.");
        setTimeout(() => setResyncNotice(null), 4000);
      }
    });
  }, [socket, session, isResyncing, audioRef, sharedTrack]);

  // Host playback controls
  const hostPlay = useCallback((position = 0) => {
    if (!socket || !session || !hostToken) return;
    socket.emit("request-play", {
      sessionId: session.id,
      hostToken,
      position,
      leadTimeMs: 1200,
    });
  }, [socket, session, hostToken]);

  const hostPause = useCallback(() => {
    if (!socket || !session || !hostToken) return;
    const pos = audioRef?.current ? audioRef.current.currentTime : 0;
    socket.emit("request-pause", {
      sessionId: session.id,
      hostToken,
      position: pos,
    });
  }, [socket, session, hostToken, audioRef]);

  const hostSeek = useCallback((position) => {
    if (!socket || !session || !hostToken) return;
    socket.emit("request-seek", {
      sessionId: session.id,
      hostToken,
      position,
      leadTimeMs: 800,
    });
  }, [socket, session, hostToken]);

  // Share a song from local library with the session
  const shareSong = useCallback(async (song) => {
    if (!song || !song.path) {
      setShareError("No song selected to share.");
      return { success: false, error: "No song selected to share." };
    }
    if (!session?.id) {
      setShareError("No active session. Please create or join a session first.");
      return { success: false, error: "No active session." };
    }
    if (!hostToken) {
      setShareError("Only the session host can share songs.");
      return { success: false, error: "Only the session host can share songs." };
    }

    setIsSharingTrack(true);
    setShareError(null);
    setShareSuccess(null);

    try {
      const songTitle = song.name || song.title || "Untitled Track";
      if (musicService.isElectron()) {
        const res = await musicService.shareSongToSession({
          sessionId: session.id,
          hostToken,
          songPath: song.path,
          title: songTitle,
          artist: song.artist || "Unknown Artist",
          album: song.album || "",
          duration: song.duration || 0,
        });

        if (!res || !res.success) {
          throw new Error(res?.error || "Failed to share song via Electron IPC.");
        }

        const msg = `"${songTitle}" shared with session!`;
        setShareSuccess(msg);
        setTimeout(() => setShareSuccess(null), 5000);
        return { success: true, track: res.track };
      } else {
        const serverHost = serverUrlRef.current || window.location.origin;
        const res = await fetch(`${serverHost}/api/sessions/${session.id}/track`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-host-token": hostToken,
          },
          body: JSON.stringify({
            localFilePath: song.path,
            title: songTitle,
            artist: song.artist || "Unknown Artist",
            album: song.album || "",
            duration: song.duration || 0,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to share song via server API.");
        }

        const msg = `"${songTitle}" shared with session!`;
        setShareSuccess(msg);
        setTimeout(() => setShareSuccess(null), 5000);
        return { success: true, track: data.track };
      }
    } catch (err) {
      console.error("Error sharing song:", err);
      setShareError(err.message);
      setTimeout(() => setShareError(null), 6000);
      return { success: false, error: err.message };
    } finally {
      setIsSharingTrack(false);
    }
  }, [session?.id, hostToken]);

  // Unlock audio context for mobile browsers that block programmatic playback
  const unlockAudio = useCallback(async () => {
    // In Electron desktop environment, autoplay is unrestricted
    if (musicService.isElectron()) {
      setAutoplayBlocked(false);
      return;
    }

    // Unlock Web Audio context if available
    if (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext)) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        await ctx.resume();
        ctx.close();
      } catch (_) {}
    }

    if (!audioRef?.current) return;
    const audio = audioRef.current;

    // If audio already has an active source and is paused, prime it safely
    if (audio.src && audio.paused) {
      const prevMuted = audio.muted;
      try {
        audio.muted = true;
        await audio.play();
        audio.pause();
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn("[SyncBeat] Audio unlock prime skipped:", err.message);
        }
      } finally {
        audio.muted = prevMuted;
      }
    }

    setAutoplayBlocked(false);

    // If session is playing and has track, catch up to current position
    if (session?.playback?.state === "playing" && (audio.src || trackBlobUrl)) {
      try {
        const elapsed = (Date.now() - (session.playback.updatedAt - clockOffsetRef.current)) / 1000;
        const currentPos = (session.playback.position || 0) + Math.max(0, elapsed);
        audio.currentTime = currentPos;
        await audio.play();
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn("[SyncBeat] Catch-up play failed:", err.message);
        }
      }
    }
  }, [audioRef, session, trackBlobUrl]);

  return {
    session,
    myParticipant,
    connectionStatus,
    clockOffset,
    rtt,
    sharedTrack,
    trackBlobUrl,
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
    hostSeek,
    shareSong,
    isSharingTrack,
    shareSuccess,
    shareError,
    playbackDiagnostics,
    autoplayBlocked,
    unlockAudio,
  };
}

export default useSyncSession;
