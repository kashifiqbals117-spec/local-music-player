import { useCallback, useEffect, useRef, useState } from "react";
import musicService from "../services/musicService";

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

  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playerError, setPlayerError] = useState(null);

  // Safely cleanup Blob URL on unmount
  useEffect(() => {
    return () => {
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
    };
  }, []);

  // Synchronize audio element volume and muted states with React state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Play a selected song
  const playSong = useCallback(async (song) => {
    if (!song || !song.path) return;

    try {
      setPlayerError(null);

      // If the song is already loaded, restart or continue without re-reading file from disk
      if (currentSong?.path === song.path && activeUrlRef.current && audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.volume = volume;
        audioRef.current.muted = isMuted;
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
      const url = URL.createObjectURL(blob);

      // Revoke previous URL only after the new one is created
      const oldUrl = activeUrlRef.current;
      activeUrlRef.current = url;
      if (oldUrl && oldUrl !== url) {
        URL.revokeObjectURL(oldUrl);
      }

      setCurrentSong({
        ...song,
        url,
      });
      setCurrentTime(0);
      setDuration(song.duration || 0);
      setIsPlaying(true);
    } catch (err) {
      console.error("Error initiating playback:", err);
      setPlayerError("Error initiating playback");
      setIsPlaying(false);
    }
  }, [currentSong?.path, isMuted, volume]);

  // Trigger play when new song URL is ready
  useEffect(() => {
    if (!currentSong?.url || !audioRef.current) return;

    const audio = audioRef.current;
    let isCurrent = true;

    // Apply volume and unmuted status explicitly
    audio.volume = volume;
    audio.muted = isMuted;

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
        } catch (_) {}
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

  const handleEnded = useCallback((playlist = []) => {
    setIsPlaying(false);
    if (playlist && playlist.length > 0 && currentSong) {
      const idx = playlist.findIndex((s) => s.path === currentSong.path);
      if (idx !== -1 && idx < playlist.length - 1) {
        playSong(playlist[idx + 1]);
      }
    }
  }, [currentSong, playSong]);

  // Next / Previous navigation
  const playNext = useCallback((playlist = []) => {
    if (!playlist || playlist.length === 0 || !currentSong) return;
    const idx = playlist.findIndex((s) => s.path === currentSong.path);
    if (idx !== -1 && idx < playlist.length - 1) {
      playSong(playlist[idx + 1]);
    } else if (playlist.length > 0) {
      playSong(playlist[0]);
    }
  }, [currentSong, playSong]);

  const playPrevious = useCallback((playlist = []) => {
    if (!playlist || playlist.length === 0 || !currentSong) return;
    if (currentTime > 3) {
      handleSeek(0);
      return;
    }
    const idx = playlist.findIndex((s) => s.path === currentSong.path);
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
    handleEnded,
  };
}

export default useAudioPlayer;
