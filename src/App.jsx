import { useState } from "react";
import "./App.css";

import Sidebar from "./components/Sidebar";
import MusicPlayer from "./components/Player/MusicPlayer";
import useMusicLibrary from "./hooks/useMusicLibrary";
import useAudioPlayer from "./hooks/useAudioPlayer";

import Home from "./pages/Home";
import Songs from "./pages/Songs";
import Albums from "./pages/Albums";
import Artists from "./pages/Artists";
import Playlists from "./pages/Playlists";

function App() {
  const [activeTab, setActiveTab] = useState("songs");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("title");

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
  } = useAudioPlayer();

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
        onPlayPause={playPause}
        onSeek={handleSeek}
        onPrevious={() => playPrevious(songs)}
        onNext={() => playNext(songs)}
        volume={volume}
        onVolumeChange={setVolume}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        audioRef={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => handleEnded(songs)}
      />
    </div>
  );
}

export default App;