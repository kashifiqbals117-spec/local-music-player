import { useState, useEffect } from "react";
import api from "../services/api";
import userLibrary from "../services/userLibraryService";
import { formatTime } from "../utils/formatTime";

export function OnlineHome({
  onPlaySong,
  onAddToQueue,
  currentSong,
  isPlaying,
  syncSession,
  onNavigate,
}) {
  const [librarySnapshot, setLibrarySnapshot] = useState(() => userLibrary.getSnapshot());
  const [trendingTracks, setTrendingTracks] = useState([]);
  const [isTrendingLoading, setIsTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState(null);

  // Subscribe to library updates
  useEffect(() => {
    const unsubscribe = userLibrary.subscribe((lib) => {
      setLibrarySnapshot({ ...lib });
    });
    userLibrary.fetchLibrary();
    return unsubscribe;
  }, []);

  // Fetch trending tracks on mount
  useEffect(() => {
    let active = true;
    (async () => {
      setIsTrendingLoading(true);
      setTrendingError(null);
      try {
        const data = await api.getTrendingMusic({ limit: 12, time: "week" });
        if (active) {
          setTrendingTracks(data?.tracks || []);
        }
      } catch (err) {
        if (active) {
          setTrendingError(err.message || "Could not load trending music.");
        }
      } finally {
        if (active) {
          setIsTrendingLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const likedTracks = librarySnapshot.likedTracks || [];
  const playlists = librarySnapshot.playlists || [];
  const recentlyPlayed = librarySnapshot.recentlyPlayed || [];

  const handlePlayLikedAll = () => {
    if (likedTracks.length === 0) return;
    onPlaySong(likedTracks[0]);
    if (likedTracks.length > 1) {
      for (let i = 1; i < likedTracks.length; i++) {
        onAddToQueue(likedTracks[i]);
      }
    }
  };

  const handleAddLikedToSession = async () => {
    if (!syncSession?.session || likedTracks.length === 0) return;
    for (const track of likedTracks) {
      await syncSession.addToSessionQueue(track);
    }
  };

  return (
    <div className="page online-home-page">
      {/* Hero Welcome Banner */}
      <section className="online-hero-banner">
        <div className="hero-content">
          <div className="hero-tag">⚡ SYNCBEAT ONLINE</div>
          <h1 className="hero-title">Stream &amp; Synchronize Anywhere</h1>
          <p className="hero-desc">
            Discover over 1,000,000+ indie and electronic releases on Audius. Listen solo or host a synchronized room with friends across any phone or laptop.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="hero-primary-btn"
              onClick={() => onNavigate("online-search")}
            >
              🔍 Search Audius Music
            </button>
            <button
              type="button"
              className="hero-secondary-btn"
              onClick={() => onNavigate("sync")}
            >
              ⚡ Host Online Room
            </button>
          </div>
        </div>

        {/* Liked Songs Quick Card */}
        <div className="hero-liked-card">
          <div className="liked-card-art">
            <span className="liked-heart-big">❤️</span>
          </div>
          <div className="liked-card-info">
            <span className="liked-card-label">YOUR COLLECTION</span>
            <h3>Liked Songs</h3>
            <p className="liked-card-count">
              {likedTracks.length} {likedTracks.length === 1 ? "track" : "tracks"} saved
            </p>
          </div>
          <div className="liked-card-buttons">
            <button
              type="button"
              className="liked-play-btn"
              onClick={handlePlayLikedAll}
              disabled={likedTracks.length === 0}
              title="Play all liked songs"
            >
              ▶ Play Liked
            </button>
            {syncSession?.session && (
              <button
                type="button"
                className="liked-queue-btn"
                onClick={handleAddLikedToSession}
                title="Add all liked songs to shared session queue"
              >
                + Add to Session
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Trending Tracks Section */}
      <section className="online-section">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">🔥 Trending on Audius</h2>
            <p className="section-subtitle">Top global releases this week</p>
          </div>
          <button
            type="button"
            className="section-link-btn"
            onClick={() => onNavigate("online-discover")}
          >
            Explore All Charts →
          </button>
        </div>

        {isTrendingLoading ? (
          <div className="online-loading-spinner">
            <span className="spinner">⏳</span>
            <p>Loading trending charts from Audius...</p>
          </div>
        ) : trendingError ? (
          <div className="online-error-box">
            <span>⚠️ {trendingError}</span>
          </div>
        ) : trendingTracks.length === 0 ? (
          <div className="empty-state">
            <p>No trending tracks available.</p>
          </div>
        ) : (
          <div className="trending-grid">
            {trendingTracks.map((track) => {
              const isCurrent = (currentSong?.id || currentSong?.streamUrl) === (track.id || track.streamUrl);
              const isLiked = userLibrary.isLiked(track.id);

              return (
                <div
                  key={track.id}
                  className={`track-card ${isCurrent ? "active-playing" : ""}`}
                >
                  <div className="card-artwork-wrap">
                    {track.artwork ? (
                      <img src={track.artwork} alt={track.title} loading="lazy" />
                    ) : (
                      <div className="card-placeholder-art">🌐</div>
                    )}
                    <button
                      type="button"
                      className="card-play-overlay-btn"
                      onClick={() => onPlaySong(track)}
                      aria-label={`Play ${track.title}`}
                    >
                      {isCurrent && isPlaying ? "⏸" : "▶"}
                    </button>
                  </div>

                  <div className="card-meta">
                    <span className="card-track-title" title={track.title}>
                      {track.title}
                    </span>
                    <span className="card-artist-name" title={track.artist}>
                      {track.artist}
                    </span>
                    <span className="card-duration">{formatTime(track.duration)}</span>
                  </div>

                  <div className="card-actions-bar">
                    <button
                      type="button"
                      className={`card-heart-btn ${isLiked ? "liked" : ""}`}
                      onClick={() => userLibrary.toggleLike(track)}
                      title={isLiked ? "Unlike" : "Like"}
                    >
                      {isLiked ? "❤️" : "🤍"}
                    </button>

                    <button
                      type="button"
                      className="card-queue-btn"
                      onClick={() => onAddToQueue(track)}
                      title="Add to player queue"
                    >
                      ➕ Queue
                    </button>

                    {syncSession?.session && (
                      <button
                        type="button"
                        className="card-session-btn"
                        onClick={() => syncSession.addToSessionQueue(track)}
                        title="Add to shared room queue"
                      >
                        ⚡ Room
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* User Playlists Section */}
      <section className="online-section">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">📂 Your Playlists</h2>
            <p className="section-subtitle">Synced across your devices</p>
          </div>
          <button
            type="button"
            className="section-link-btn"
            onClick={() => onNavigate("online-playlists")}
          >
            Manage Playlists →
          </button>
        </div>

        <div className="playlists-summary-grid">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className="playlist-summary-card"
              onClick={() => onNavigate("online-playlists")}
            >
              <div className="playlist-summary-icon">📂</div>
              <div className="playlist-summary-info">
                <h4>{pl.name}</h4>
                <p>{pl.tracks?.length || 0} tracks</p>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="playlist-summary-add-card"
            onClick={() => onNavigate("online-playlists")}
          >
            <span className="add-icon">➕</span>
            <span>Create New Playlist</span>
          </button>
        </div>
      </section>

      {/* Recently Played Section */}
      {recentlyPlayed.length > 0 && (
        <section className="online-section">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">🕒 Recently Played</h2>
              <p className="section-subtitle">Resume where you left off</p>
            </div>
            <button
              type="button"
              className="section-link-btn"
              onClick={() => onNavigate("recently-played")}
            >
              View History →
            </button>
          </div>

          <div className="recent-tracks-row">
            {recentlyPlayed.slice(0, 6).map((track) => (
              <div
                key={track.id + (track.playedAt || "")}
                className="recent-track-pill"
                onClick={() => onPlaySong(track)}
              >
                <div className="pill-art">
                  {track.artwork ? <img src={track.artwork} alt="" /> : "🎵"}
                </div>
                <div className="pill-info">
                  <span className="pill-title">{track.title}</span>
                  <span className="pill-artist">{track.artist}</span>
                </div>
                <span className="pill-play-icon">▶</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default OnlineHome;
