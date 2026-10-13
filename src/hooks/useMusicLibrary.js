import { useCallback, useEffect, useState } from "react";
import musicService from "../services/musicService";

export function useMusicLibrary() {
  const [songs, setSongs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all songs from SQLite via service
  const loadSongs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const savedSongs = await musicService.getSongs();
      setSongs(savedSongs || []);
    } catch (err) {
      console.error("Failed to load music library:", err);
      setError("Failed to load music library.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load when app mounts
  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  // Import individual music files
  const addSongs = useCallback(async () => {
    try {
      setError(null);
      const importedSongs = await musicService.selectMusicFiles();

      if (importedSongs && importedSongs.length > 0) {
        await loadSongs();
      }
      return importedSongs;
    } catch (err) {
      console.error("Failed to import music files:", err);
      setError("Failed to import music files.");
      return [];
    }
  }, [loadSongs]);

  // Import music from a folder (recursive)
  const addFolder = useCallback(async () => {
    try {
      setError(null);
      const importedSongs = await musicService.selectMusicFolder();

      if (importedSongs && importedSongs.length > 0) {
        await loadSongs();
      }
      return importedSongs;
    } catch (err) {
      console.error("Failed to import music folder:", err);
      setError("Failed to import music folder.");
      return [];
    }
  }, [loadSongs]);

  return {
    songs,
    setSongs,
    addSongs,
    addFolder,
    loadSongs,
    isLoading,
    error,
  };
}

export default useMusicLibrary;