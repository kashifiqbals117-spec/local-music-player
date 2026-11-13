import { useCallback, useEffect, useRef, useState } from "react";
import musicService from "../services/musicService";
import api from "../services/api";

const MIME_TYPES = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac",
};

export function useAudioPlayer() {
  const audioRef = useRef(null);
  const activeUrlRef = useRef(null);
  const playPromiseRef = useRef(null);
  const autoPlayRef = useRef(true);

  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const [queue, setQueue] = useState([]);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);
  const queueRef = useRef(queue);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const addToQueue = useCallback((song) => {
    if (!song) return;
    setQueue((prev) => [...prev, song]);
  }, []);

  const removeFromQueue = useCallback((index) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  // Safely cleanup Blob URL on unmount
  useEffect(() => {
    return () => {
      if (activeUrlRef.current && activeUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
    };
  }, []);

  // Synchronize audio element volume and muted states with React state
  useEffect(() => {
    volumeRef.current = volume;
    isMutedRef.current = isMuted;
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Play a selected song (local file or Audius online track) with optional autoPlay control
  const playSong = useCallback(async (song, { autoPlay = true } = {}) => {
    if (!song) return;

    const isOnlineTrack =
      song.source === "audius" ||
      Boolean(song.streamUrl) ||
      (!song.path && (Boolean(song.url) || Boolean(song.id)));

    if (!isOnlineTrack && !song.path) return;

    try {
      setPlayerError(null);
      autoPlayRef.current = autoPlay !== false;

      // Unique identifier for comparing songs (supports both local path and online id)
      const songIdentifier = isOnlineTrack ? (song.id || song.streamUrl || song.url) : song.path;
      const currentIdentifier = currentSong?.source === "audius"
        ? (currentSong.id || currentSong.streamUrl || currentSong.url)
        : currentSong?.path;

      // If the song is already loaded, restart or continue without re-reading
      if (currentIdentifier && currentIdentifier === songIdentifier && activeUrlRef.current && audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.volume = volume;
        audioRef.current.muted = isMuted;

        if (!autoPlayRef.current) {
          setIsPlaying(false);
          return;
        }

        try {
          const p = audioRef.current.play();
          playPromiseRef.current = p;
          await p;
          setIsPlaying(true);
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("Playback failed:", err);
            setPlayerError(err.message || "Failed to start playback");
            setIsPlaying(false);
          }
        }
        return;
      }

      let url;
      if (isOnlineTrack) {
        url = song.streamUrl || song.url || (song.id ? api.getStreamUrl(song.id) : null);
        if (!url) {
          throw new Error("Missing stream URL for online track.");
        }
      } else {
        const result = await musicService.readMusicFile(song.path);
        if (!result.success) {
          console.error("Failed to read music file:", result.error);
          setPlayerError(result.error || "Failed to load audio file");
          setIsPlaying(false);
          return;
        }

        const ext = (song.path || song.name || "")
          .split(".")
          .pop()
          .toLowerCase();
        const mimeType = MIME_TYPES[ext] || "audio/mpeg";

        const blob = new Blob([result.data], { type: mimeType });
        url = URL.createObjectURL(blob);
      }

      // Revoke previous blob URL safely only if it was a blob URL
      const oldUrl = activeUrlRef.current;
      activeUrlRef.current = url;
      if (oldUrl && oldUrl !== url && oldUrl.startsWith("blob:")) {
        URL.revokeObjectURL(oldUrl);
      }

      setCurrentSong({
        ...song,
        id: song.id || songIdentifier,
        name: song.title || song.name || "Untitled Track",
        title: song.title || song.name || "Untitled Track",
        artist: song.artist || "Unknown Artist",
        album: song.album || "",
        duration: Number(song.duration) || 0,
        artwork: song.artwork || null,
        source: isOnlineTrack ? "audius" : (song.source || "local"),
        streamUrl: isOnlineTrack ? (song.streamUrl || url) : null,
        url,
      });
      setCurrentTime(0);
      setDuration(Number(song.duration) || 0);
      setIsPlaying(autoPlayRef.current);
    } catch (err) {
      console.error("Error initiating playback:", err);
      setPlayerError(err.message || "Error initiating playback");
      setIsPlaying(false);
    }
  }, [currentSong, isMuted, volume]);

  // Trigger play when new song URL is ready
  useEffect(() => {
    if (!currentSong?.url || !audioRef.current) return;

    const audio = audioRef.current;
    let isCurrent = true;

    // Apply volume and unmuted status explicitly
    audio.volume = volumeRef.current;
    audio.muted = isMutedRef.current;

    if (!autoPlayRef.current) {
      audio.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    const playAudio = async () => {
      try {
        const playPromise = audio.play();
        playPromiseRef.current = playPromise;
        await playPromise;
        if (isCurrent) {
          setIsPlaying(true);
          setPlayerError(null);
        }
      } catch (err) {
        // AbortError occurs when a new load request supersedes this play() request.
        // It is an expected transition when switching songs and should not log an error
        // or break the active playing state of the new song.
        if (err.name === "AbortError") {
          return;
        }
        console.error("Audio playback error:", err);
        if (isCurrent) {
          setIsPlaying(false);
          setPlayerError(err.message || "Audio playback failed");
        }
      }
    };

    playAudio();

    return () => {
      isCurrent = false;
    };
  }, [currentSong?.url]);

  // Play/pause toggle
  const playPause = useCallback(async () => {
    if (!audioRef.current || !currentSong) return;
    const audio = audioRef.current;

    if (isPlaying) {
      // Wait for any in-flight play request before pausing to prevent AbortError
      if (playPromiseRef.current) {
        try {
          await playPromiseRef.current;
        } catch {
          // Ignore interrupted play promise
        }
      }
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        audio.volume = volume;
        audio.muted = isMuted;
        const p = audio.play();
        playPromiseRef.current = p;
        await p;
        setIsPlaying(true);
        setPlayerError(null);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Playback failed to resume:", err);
          setPlayerError(err.message || "Failed to resume playback");
          setIsPlaying(false);
        }
      }
    }
  }, [currentSong, isPlaying, volume, isMuted]);

  // Seeking
  const handleSeek = useCallback((time) => {
    const seekTime = Number(time);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
    }
    setCurrentTime(seekTime);
  }, []);

  // Audio element event handlers
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const playFromQueue = useCallback(() => {
    if (queueRef.current && queueRef.current.length > 0) {
      const nextSong = queueRef.current[0];
      setQueue((prev) => prev.slice(1));
      playSong(nextSong);
      return true;
    }
    return false;
  }, [playSong]);

  const handleEnded = useCallback((playlist = []) => {
    setIsPlaying(false);
    // 1. Check if there are queued tracks first
    if (playFromQueue()) {
      return;
    }
    // 2. Fallback to existing playlist sequence
    if (playlist && playlist.length > 0 && currentSong) {
      const currentIdentifier = currentSong.source === "audius"
        ? (currentSong.id || currentSong.streamUrl)
        : currentSong.path;
      const idx = playlist.findIndex((s) => {
        const id = s.source === "audius" ? (s.id || s.streamUrl) : s.path;
        return id === currentIdentifier;
      });
      if (idx !== -1 && idx < playlist.length - 1) {
        playSong(playlist[idx + 1]);
      }
    }
  }, [currentSong, playFromQueue, playSong]);

  // Next / Previous navigation
  const playNext = useCallback((playlist = []) => {
    // 1. Play from user queue first if present
    if (playFromQueue()) {
      return;
    }
    if (!playlist || playlist.length === 0 || !currentSong) return;
    const currentIdentifier = currentSong.source === "audius"
      ? (currentSong.id || currentSong.streamUrl)
      : currentSong.path;
    const idx = playlist.findIndex((s) => {
      const id = s.source === "audius" ? (s.id || s.streamUrl) : s.path;
      return id === currentIdentifier;
    });
    if (idx !== -1 && idx < playlist.length - 1) {
      playSong(playlist[idx + 1]);
    } else if (playlist.length > 0) {
      playSong(playlist[0]);
    }
  }, [currentSong, playFromQueue, playSong]);

  const playPrevious = useCallback((playlist = []) => {
    if (!playlist || playlist.length === 0 || !currentSong) return;
    if (currentTime > 3) {
      handleSeek(0);
      return;
    }
    const currentIdentifier = currentSong.source === "audius"
      ? (currentSong.id || currentSong.streamUrl)
      : currentSong.path;
    const idx = playlist.findIndex((s) => {
      const id = s.source === "audius" ? (s.id || s.streamUrl) : s.path;
      return id === currentIdentifier;
    });
    if (idx > 0) {
      playSong(playlist[idx - 1]);
    } else if (playlist.length > 0) {
      playSong(playlist[playlist.length - 1]);
    }
  }, [currentSong, currentTime, handleSeek, playSong]);

  // Volume controls
  const setVolume = useCallback((newVolume) => {
    const vol = Math.max(0, Math.min(1, Number(newVolume)));
    setVolumeState(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    if (vol > 0 && isMuted) {
      setIsMuted(false);
      if (audioRef.current) audioRef.current.muted = false;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      const nextMuted = !isMuted;
      setIsMuted(nextMuted);
      audioRef.current.muted = nextMuted;
    }
  }, [isMuted]);

  return {
    audioRef,
    currentSong,
    isPlaying,
    setIsPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playerError,
    playSong,
    playPause,
    handleSeek,
    playNext,
    playPrevious,
    setVolume,
    toggleMute,
    handleTimeUpdate,
    handleLoadedMetadata,
    handlePlay,
    handlePause,
    handleEnded,
    queue,
    addToQueue,
    removeFromQueue,
    clearQueue,
  };
}

export default useAudioPlayer;
