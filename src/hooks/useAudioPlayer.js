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

  // Play a selected song
  const playSong = useCallback(async (song) => {
    if (!song || !song.path) return;

    try {
      setPlayerError(null);
      const result = await musicService.readMusicFile(song.path);

      if (!result.success) {
        console.error("Failed to read music file:", result.error);
        setPlayerError(result.error || "Failed to load audio file");
        return;
      }

      // Revoke previous Blob URL if one was active
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }

      const ext = (song.path || song.name || "")
        .split(".")
        .pop()
        .toLowerCase();
      const mimeType = MIME_TYPES[ext] || "audio/mpeg";

      const blob = new Blob([result.data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      activeUrlRef.current = url;

      setCurrentSong({
        ...song,
        url,
      });
      setCurrentTime(0);
      setIsPlaying(true);
    } catch (err) {
      console.error("Error initiating playback:", err);
      setPlayerError("Error initiating playback");
      setIsPlaying(false);
    }
  }, []);

  // Trigger play when new song URL is ready
  useEffect(() => {
    if (!currentSong?.url || !audioRef.current) return;

    const audio = audioRef.current;
    audio.load();

    const playAudio = async () => {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        console.error("Audio playback error:", err);
        setIsPlaying(false);
      }
    };

    playAudio();
  }, [currentSong?.url]);

  // Play/pause toggle
  const playPause = useCallback(async () => {
    if (!audioRef.current || !currentSong) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error("Playback failed to resume:", err);
      }
    }
  }, [currentSong, isPlaying]);

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
