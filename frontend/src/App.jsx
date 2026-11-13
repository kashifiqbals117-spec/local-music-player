import { useState, useEffect, useCallback } from "react";
import "./App.css";

import Sidebar from "./components/Sidebar";
import MusicPlayer from "./components/Player/MusicPlayer";
import ModeSelect from "./components/ModeSelect";
import SyncKeyModal from "./components/SyncKeyModal";

import useMusicLibrary from "./hooks/useMusicLibrary";
import useAudioPlayer from "./hooks/useAudioPlayer";
import useSyncSession from "./hooks/useSyncSession";
import userLibrary from "./services/userLibraryService";
import musicService from "./services/musicService";

// Offline Pages
import Home from "./pages/Home";
import Songs from "./pages/Songs";
import Albums from "./pages/Albums";
import Artists from "./pages/Artists";
import Playlists from "./pages/Playlists";
import SyncSession from "./pages/SyncSession";

// Online Pages
import OnlineHome from "./pages/OnlineHome";
import OnlineSearch from "./pages/OnlineSearch";
import OnlineDiscover from "./pages/OnlineDiscover";
import LikedSongs from "./pages/LikedSongs";
import OnlinePlaylists from "./pages/OnlinePlaylists";
import RecentlyPlayed from "./pages/RecentlyPlayed";

function getInitialSessionIdFromUrl() {
  if (typeof window === "undefined") return "";
  const urlSession = new URLSearchParams(window.location.search).get("session");
  return urlSession ? urlSession.toUpperCase().trim() : "";
}

function getInitialAppMode(urlSessionId) {
  if (typeof window === "undefined") return "offline";
  const saved = localStorage.getItem("syncbeat_preferred_mode");
  if (saved === "online" || saved === "offline") {
    return saved;
  }
  // If user joins via a public invite link (?session=XYZ), auto-select online mode
  if (urlSessionId) {
    return "online";
  }
  // On desktop Electron with no saved mode, default to null so user can choose
  return null;
}

function App() {
  const [initialUrlSessionId] = useState(getInitialSessionIdFromUrl);
  const [appMode, setAppMode] = useState(() => getInitialAppMode(initialUrlSessionId));
  const [showModeModal, setShowModeModal] = useState(false);
  const [showSyncKeyModal, setShowSyncKeyModal] = useState(false);

  const [activeTab, setActiveTab] = useState(() => {
    if (initialUrlSessionId) return "sync";
    const initialMode = getInitialAppMode(initialUrlSessionId);
    return initialMode === "online" ? "online-home" : "songs";
  });

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
    playSong: internalPlaySong,
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

  // Track playback in user library history
  const playSong = useCallback(
    (song, options) => {
      if (song) {
        userLibrary.recordHistory(song);
      }
      return internalPlaySong(song, options);
    },
    [internalPlaySong]
  );

  // Coordinated play/pause handler: host coordinates playback timing across session
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
  const handlePlayerSeek = useCallback(
    (pos) => {
      if (syncSession.session && syncSession.hostToken) {
        syncSession.hostSeek(pos);
      } else {
        handleSeek(pos);
      }
    },
    [syncSession, handleSeek]
  );

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

  // Mode Selection handler
  const handleSelectMode = (newMode) => {
    setAppMode(newMode);
    setShowModeModal(false);

    // Switch default tab if on an incompatible tab
    if (newMode === "online") {
      if (["home", "songs", "albums", "artists", "playlists"].includes(activeTab)) {
        setActiveTab("online-home");
      }
    } else {
      if (["online-home", "online-search", "online-discover", "liked-songs", "online-playlists", "recently-played"].includes(activeTab)) {
        setActiveTab("songs");
      }
    }
  };

  const renderActivePage = () => {
    const commonOfflineProps = {
      songs,
      currentSong,
      isPlaying,
      onPlaySong: playSong,
      onAddSongs: addSongs,
      onAddFolder: addFolder,
      onAddToQueue: addToQueue,
      onAddToSessionQueue: syncSession.addToSessionQueue,
      isSessionActive: Boolean(syncSession.session),
    };

    const commonOnlineProps = {
      currentSong,
      isPlaying,
      onPlaySong: playSong,
      onAddToQueue: addToQueue,
      syncSession,
      onNavigate: setActiveTab,
    };

    switch (activeTab) {
      // OFFLINE MODE TABS
      case "home":
        return <Home {...commonOfflineProps} onNavigate={setActiveTab} />;

      case "albums":
        return <Albums {...commonOfflineProps} />;

      case "artists":
        return <Artists {...commonOfflineProps} />;

      case "playlists":
        return <Playlists {...commonOfflineProps} />;

      case "songs":
        return (
          <Songs
            {...commonOfflineProps}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
        );

      // ONLINE MODE TABS
      case "online-home":
        return <OnlineHome {...commonOnlineProps} />;

      case "online-search":
        return <OnlineSearch {...commonOnlineProps} />;

      case "online-discover":
        return <OnlineDiscover {...commonOnlineProps} />;

      case "liked-songs":
        return <LikedSongs {...commonOnlineProps} />;

      case "online-playlists":
        return <OnlinePlaylists {...commonOnlineProps} />;

      case "recently-played":
        return <RecentlyPlayed {...commonOnlineProps} />;

      // SHARED UNIFIED SYNC SESSION (BOTH OFFLINE AND ONLINE ROOMS)
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

      default:
        return appMode === "online" ? (
          <OnlineHome {...commonOnlineProps} />
        ) : (
          <Songs
            {...commonOfflineProps}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
        );
    }
  };

  return (
    <div className={`app mode-${appMode || "undecided"}`}>
      {/* Initial Mode Selection Screen if no mode chosen yet */}
      {!appMode && (
        <ModeSelect onSelectMode={handleSelectMode} initialRemember={true} />
      )}

      {/* Switch Mode Modal (when triggered via Sidebar Switcher) */}
      {showModeModal && (
        <ModeSelect
          onSelectMode={handleSelectMode}
          initialRemember={true}
          onCancel={() => setShowModeModal(false)}
        />
      )}

      {/* Cross-Device Library Sync Key Modal */}
      <SyncKeyModal
        isOpen={showSyncKeyModal}
        onClose={() => setShowSyncKeyModal(false)}
      />

      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        appMode={appMode || "offline"}
        onOpenModeSelect={() => setShowModeModal(true)}
        onOpenSyncModal={() => setShowSyncKeyModal(true)}
      />

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

        {isLoading && songs.length === 0 && appMode === "offline" ? (
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
