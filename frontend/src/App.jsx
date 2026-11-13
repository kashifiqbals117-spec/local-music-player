import { useState, useEffect, useCallback } from "react";
import "./App.css";

import Sidebar from "./components/Sidebar";
import MusicPlayer from "./components/Player/MusicPlayer";
import useMusicLibrary from "./hooks/useMusicLibrary";
import useAudioPlayer from "./hooks/useAudioPlayer";
import useSyncSession from "./hooks/useSyncSession";

import Home from "./pages/Home";
import Songs from "./pages/Songs";
import Albums from "./pages/Albums";
import Artists from "./pages/Artists";
import Playlists from "./pages/Playlists";
import SyncSession from "./pages/SyncSession";
import OnlineMusic from "./pages/OnlineMusic";

function getInitialSessionIdFromUrl() {
  if (typeof window === "undefined") return "";
  const urlSession = new URLSearchParams(window.location.search).get("session");
  return urlSession ? urlSession.toUpperCase().trim() : "";
}

function App() {
  const [initialUrlSessionId] = useState(getInitialSessionIdFromUrl);
  const [activeTab, setActiveTab] = useState(() => (initialUrlSessionId ? "sync" : "songs"));
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("title");
  const [activeSessionId, setActiveSessionId] = useState(initialUrlSessionId);

  const {
    songs,
    addSongs,
    addFolder,
    isLoading,
    error: libraryError,
  } = useMusicLibrary();

  const {
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
  } = useAudioPlayer();

  const syncSession = useSyncSession({
    audioRef,
    onLocalPlay: () => setIsPlaying(true),
    onLocalPause: () => setIsPlaying(false),
    onLocalSeek: (pos) => handleSeek(pos),
  });

  // Coordinated play/pause handler: prevents host from starting immediately without network coordination
  const handlePlayerPlayPause = useCallback(() => {
    if (syncSession.session && syncSession.hostToken) {
      if (isPlaying) {
        syncSession.hostPause();
      } else {
        const cur = audioRef?.current ? audioRef.current.currentTime : currentTime;
        syncSession.hostPlay(cur);
      }
    } else {
      playPause();
    }
  }, [syncSession, isPlaying, audioRef, currentTime, playPause]);

  // Coordinated seek handler
  const handlePlayerSeek = useCallback((pos) => {
    if (syncSession.session && syncSession.hostToken) {
      syncSession.hostSeek(pos);
    } else {
      handleSeek(pos);
    }
  }, [syncSession, handleSeek]);

  const { joinSession } = syncSession;

  // Automatically join session if opened with ?session=XYZ
  useEffect(() => {
    if (initialUrlSessionId) {
      joinSession({
        sessionId: initialUrlSessionId,
        name: localStorage.getItem("syncbeat_display_name") || "Guest",
      });
    }
  }, [initialUrlSessionId, joinSession]);

  const renderActivePage = () => {
    const commonProps = {
      songs,
      currentSong,
      isPlaying,
      onPlaySong: playSong,
      onAddSongs: addSongs,
      onAddFolder: addFolder,
    };

    switch (activeTab) {
      case "home":
        return <Home {...commonProps} onNavigate={setActiveTab} />;

      case "albums":
        return <Albums {...commonProps} />;

      case "artists":
        return <Artists {...commonProps} />;

      case "playlists":
        return <Playlists {...commonProps} />;

      case "online":
        return (
          <OnlineMusic
            currentSong={currentSong}
            isPlaying={isPlaying}
            onPlaySong={playSong}
            onAddToQueue={addToQueue}
            syncSession={syncSession}
          />
        );

      case "sync":
        return (
          <SyncSession
            syncSession={syncSession}
            currentSong={currentSong}
            onPlaySong={playSong}
            activeSessionId={activeSessionId}
            onSetSessionId={setActiveSessionId}
            songs={songs}
          />
        );

      case "songs":
      default:
        return (
          <Songs
            {...commonProps}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
        );
    }
  };

  return (
    <div className="app">
      <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

      <main className="main">
        {libraryError && (
          <div className="error-banner" role="alert">
            <span>⚠️ {libraryError}</span>
          </div>
        )}

        {playerError && (
          <div className="error-banner" role="alert">
            <span>⚠️ {playerError}</span>
          </div>
        )}

        {isLoading && songs.length === 0 ? (
          <div className="loading-state">
            <span className="spinner">⏳</span>
            <p>Loading your music library...</p>
          </div>
        ) : (
          renderActivePage()
        )}
      </main>

      <MusicPlayer
        currentSong={currentSong}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onPlayPause={handlePlayerPlayPause}
        onSeek={handlePlayerSeek}
        onPrevious={() => playPrevious(songs)}
        onNext={() => playNext(songs)}
        volume={volume}
        onVolumeChange={setVolume}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        audioRef={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={() => handleEnded(songs)}
        isSessionActive={Boolean(syncSession.session)}
        onSyncPlayback={syncSession.requestSyncPlayback}
        isResyncing={syncSession.isResyncing}
        onShareCurrentSong={syncSession.shareSong}
        isSharingTrack={syncSession.isSharingTrack}
        shareSuccess={syncSession.shareSuccess}
        isHost={Boolean(syncSession.hostToken)}
        sharedTrack={syncSession.sharedTrack}
        trackBlobUrl={syncSession.trackBlobUrl}
        queue={queue}
        onRemoveFromQueue={removeFromQueue}
        onClearQueue={clearQueue}
      />
    </div>
  );
}

export default App;