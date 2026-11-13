import { useState, useEffect, useCallback, useRef } from "react";
import api from "../services/api";
import { formatTime } from "../utils/formatTime";

const GENRES = [
  "All",
  "Electronic",
  "Hip-Hop/Rap",
  "Pop",
  "R&B/Soul",
  "Rock",
  "Lo-Fi",
  "Ambient",
  "House",
  "Techno",
  "Trap",
];

const TIME_RANGES = [
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "all", label: "All Time" },
];

export function OnlineMusic({
  currentSong,
  isPlaying = false,
  onPlaySong,
  onAddToQueue,
  syncSession = null,
}) {
  const [activeSubTab, setActiveSubTab] = useState("trending"); // 'trending' | 'search'
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [selectedTimeRange, setSelectedTimeRange] = useState("week");

  // Trending state
  const [trendingTracks, setTrendingTracks] = useState([]);
  const [isTrendingLoading, setIsTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState(null);

  // Search state
  const [searchResults, setSearchResults] = useState([]);
  const [artistResults, setArtistResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected artist inspection state
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [artistTracks, setArtistTracks] = useState([]);
  const [isArtistLoading, setIsArtistLoading] = useState(false);

  // Debounce ref for search input
  const searchTimeoutRef = useRef(null);

  // Session information
  const isSessionHost = Boolean(syncSession?.session && syncSession?.hostToken);
  const isSharingTrack = Boolean(syncSession?.isSharingTrack);

  // Load trending tracks
  const loadTrending = useCallback(async (genre = selectedGenre, time = selectedTimeRange) => {
    setIsTrendingLoading(true);
    setTrendingError(null);
    try {
      const g = genre === "All" ? undefined : genre;
      const data = await api.getTrendingMusic({ genre: g, time, limit: 30 });
      setTrendingTracks(data?.tracks || []);
    } catch (err) {
      console.error("Failed to load trending tracks:", err);
      setTrendingError(err.message || "Failed to load trending music from Audius.");
    } finally {
      setIsTrendingLoading(false);
    }
  }, [selectedGenre, selectedTimeRange]);

  // Initial load of trending tracks
  useEffect(() => {
    let active = true;
    (async () => {
      setIsTrendingLoading(true);
      setTrendingError(null);
      try {
        const data = await api.getTrendingMusic({ genre: undefined, time: "week", limit: 30 });
        if (active) {
          setTrendingTracks(data?.tracks || []);
        }
      } catch (err) {
        if (active) {
          setTrendingError(err.message || "Failed to load trending music from Audius.");
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

  // Execute search
  const executeSearch = useCallback(async (query, genre = selectedGenre) => {
    const cleanQuery = (query || "").trim();
    if (!cleanQuery) {
      setSearchResults([]);
      setArtistResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);
    setSelectedArtist(null);

    try {
      const g = genre === "All" ? undefined : genre;
      const [tracksData, artistsData] = await Promise.all([
        api.searchMusic({ query: cleanQuery, genre: g, limit: 25 }),
        api.searchArtists({ query: cleanQuery, limit: 6 }).catch(() => ({ artists: [] })),
      ]);

      setSearchResults(tracksData?.tracks || []);
      setArtistResults(artistsData?.artists || []);
    } catch (err) {
      console.error("Search failed:", err);
      setSearchError(err.message || "Search failed. Check your network connection.");
    } finally {
      setIsSearching(false);
    }
  }, [selectedGenre]);

  // Search input change handler with 400ms debounce
  const handleSearchInputChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setActiveSubTab("search");

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!val.trim()) {
      setSearchResults([]);
      setArtistResults([]);
      setHasSearched(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      executeSearch(val, selectedGenre);
    }, 450);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setActiveSubTab("search");
    executeSearch(searchQuery, selectedGenre);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setArtistResults([]);
    setHasSearched(false);
    setSelectedArtist(null);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  };

  // Genre filter selection
  const handleGenreChange = (genre) => {
    setSelectedGenre(genre);
    if (activeSubTab === "trending") {
      loadTrending(genre, selectedTimeRange);
    } else if (searchQuery.trim()) {
      executeSearch(searchQuery, genre);
    }
  };

  // Time range selection
  const handleTimeRangeChange = (range) => {
    setSelectedTimeRange(range);
    loadTrending(selectedGenre, range);
  };

  // View artist profile and their tracks
  const handleViewArtist = async (artist) => {
    setSelectedArtist(artist);
    setIsArtistLoading(true);
    try {
      const [details, tracksData] = await Promise.all([
        api.getArtistDetails(artist.id).catch(() => artist),
        api.getArtistTracks(artist.id, 25),
      ]);
      if (details) setSelectedArtist(details.artist || details);
      setArtistTracks(tracksData?.tracks || []);
    } catch (err) {
      console.error("Failed to load artist tracks:", err);
    } finally {
      setIsArtistLoading(false);
    }
  };

  // Check if a track is currently active and playing
  const isTrackActive = (track) => {
    if (!currentSong) return false;
    return (
      (currentSong.id && currentSong.id === track.id) ||
      (currentSong.streamUrl && currentSong.streamUrl === track.streamUrl) ||
      (currentSong.title === track.title && currentSong.artist === track.artist)
    );
  };

  const renderTrackCard = (track) => {
    const active = isTrackActive(track);
    const currentlyPlaying = active && isPlaying;

    return (
      <div
        key={track.id}
        className={`online-track-card ${active ? "active" : ""}`}
        role="article"
        aria-label={`${track.title} by ${track.artist}`}
      >
        <div className="track-art-wrapper">
          {track.artwork ? (
            <img
              src={track.artwork}
              alt=""
              className="track-art-img"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="track-art-fallback">🎵</div>
          )}
          <button
            type="button"
            className={`track-play-overlay-btn ${currentlyPlaying ? "playing" : ""}`}
            onClick={() => onPlaySong(track)}
            title={currentlyPlaying ? "Pause" : `Play ${track.title}`}
            aria-label={currentlyPlaying ? "Pause" : `Play ${track.title}`}
          >
            {currentlyPlaying ? "⏸" : "▶"}
          </button>
        </div>

        <div className="track-body">
          <div className="track-primary-meta">
            <strong className="track-title" title={track.title}>
              {track.title}
            </strong>
            <span className="track-artist" title={track.artist}>
              {track.artist}
            </span>
          </div>

          <div className="track-badges-row">
            <span className="online-service-badge" title="Streamed directly from Audius">
              Audius
            </span>
            {track.genre && track.genre !== "Music" && (
              <span className="track-genre-badge">{track.genre}</span>
            )}
            <span className="track-duration-badge">{formatTime(track.duration)}</span>
          </div>
        </div>

        <div className="track-actions">
          <button
            type="button"
            className={`action-btn play-btn ${active ? "active" : ""}`}
            onClick={() => onPlaySong(track)}
            title={currentlyPlaying ? "Playing" : "Play track"}
          >
            {currentlyPlaying ? "⏸ Pause" : "▶ Play"}
          </button>

          {onAddToQueue && (
            <button
              type="button"
              className="action-btn queue-btn"
              onClick={() => onAddToQueue(track)}
              title="Add track to listening queue"
            >
              + Queue
            </button>
          )}

          {isSessionHost && syncSession?.shareSong && (
            <button
              type="button"
              className="action-btn share-session-btn"
              onClick={() => syncSession.shareSong(track)}
              disabled={isSharingTrack}
              title="Share and synchronize this track with room members"
            >
              ⚡ Room
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page online-music-page">
      {/* Top Header */}
      <header className="page-header online-header">
        <div className="header-titles">
          <h2>Online Music</h2>
          <p className="subtitle">
            Stream and discover millions of free tracks powered by the Audius network
          </p>
        </div>

        {/* Search Bar */}
        <form className="online-search-bar" onSubmit={handleSearchSubmit} role="search">
          <span className="search-icon">🔍</span>
          <input
            type="search"
            className="online-search-input"
            placeholder="Search tracks, artists, genres, or moods..."
            value={searchQuery}
            onChange={handleSearchInputChange}
            aria-label="Search online music"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={handleClearSearch}
              title="Clear search"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
          <button type="submit" className="search-submit-btn">
            Search
          </button>
        </form>
      </header>

      {/* Tabs & Filters Navigation */}
      <div className="online-nav-bar">
        <div className="online-subtabs">
          <button
            type="button"
            className={`subtab-btn ${activeSubTab === "trending" ? "active" : ""}`}
            onClick={() => {
              setActiveSubTab("trending");
              setSelectedArtist(null);
            }}
          >
            🔥 Trending
          </button>
          <button
            type="button"
            className={`subtab-btn ${activeSubTab === "search" ? "active" : ""}`}
            onClick={() => {
              setActiveSubTab("search");
              if (!hasSearched && searchQuery) executeSearch(searchQuery);
            }}
          >
            🔍 Search Results
            {searchResults.length > 0 && ` (${searchResults.length})`}
          </button>
        </div>

        {/* Time filters for Trending */}
        {activeSubTab === "trending" && (
          <div className="time-filters">
            {TIME_RANGES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`pill-btn ${selectedTimeRange === t.id ? "active" : ""}`}
                onClick={() => handleTimeRangeChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Genre Filter Pills */}
      <div className="genre-pills-bar" aria-label="Genre Filters">
        {GENRES.map((g) => (
          <button
            key={g}
            type="button"
            className={`genre-pill ${selectedGenre === g ? "active" : ""}`}
            onClick={() => handleGenreChange(g)}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <section className="online-content">
        {/* ================================================================= */}
        {/* ARTIST INSPECTION VIEW                                            */}
        {/* ================================================================= */}
        {selectedArtist && (
          <div className="artist-view">
            <button
              type="button"
              className="back-btn"
              onClick={() => setSelectedArtist(null)}
            >
              ← Back to results
            </button>

            <div className="artist-banner">
              <div className="artist-avatar">
                {selectedArtist.profilePicture ? (
                  <img src={selectedArtist.profilePicture} alt="" />
                ) : (
                  <span>🎤</span>
                )}
              </div>
              <div className="artist-details">
                <h3>
                  {selectedArtist.name}
                  {selectedArtist.verified && <span className="verified-badge">✔</span>}
                </h3>
                {selectedArtist.handle && <p className="artist-handle">@{selectedArtist.handle}</p>}
                {selectedArtist.bio && <p className="artist-bio">{selectedArtist.bio}</p>}
                <div className="artist-stats">
                  <span>👥 {selectedArtist.followerCount?.toLocaleString() || 0} followers</span>
                  <span>🎵 {selectedArtist.trackCount || artistTracks.length} tracks</span>
                </div>
              </div>
            </div>

            <h4 className="section-title">Tracks by {selectedArtist.name}</h4>
            {isArtistLoading ? (
              <div className="loading-state">
                <span className="spinner">⏳</span>
                <p>Loading artist tracks...</p>
              </div>
            ) : artistTracks.length === 0 ? (
              <p className="empty-message">No streamable tracks found for this artist.</p>
            ) : (
              <div className="tracks-grid">
                {artistTracks.map((track) => renderTrackCard(track))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TRENDING TAB                                                      */}
        {/* ================================================================= */}
        {!selectedArtist && activeSubTab === "trending" && (
          <div className="trending-section">
            {isTrendingLoading ? (
              <div className="loading-state">
                <span className="spinner">⏳</span>
                <p>Loading trending tracks from Audius...</p>
              </div>
            ) : trendingError ? (
              <div className="error-banner" role="alert">
                <p>⚠️ {trendingError}</p>
                <button
                  type="button"
                  className="retry-btn"
                  onClick={() => loadTrending(selectedGenre, selectedTimeRange)}
                >
                  Retry
                </button>
              </div>
            ) : trendingTracks.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🎵</span>
                <h3>No trending tracks found</h3>
                <p>Try selecting a different genre or time range.</p>
              </div>
            ) : (
              <div className="tracks-grid">
                {trendingTracks.map((track) => renderTrackCard(track))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* SEARCH RESULTS TAB                                                */}
        {/* ================================================================= */}
        {!selectedArtist && activeSubTab === "search" && (
          <div className="search-section">
            {isSearching ? (
              <div className="loading-state">
                <span className="spinner">⏳</span>
                <p>Searching Audius network for &ldquo;{searchQuery}&rdquo;...</p>
              </div>
            ) : searchError ? (
              <div className="error-banner" role="alert">
                <p>⚠️ {searchError}</p>
                <button
                  type="button"
                  className="retry-btn"
                  onClick={() => executeSearch(searchQuery, selectedGenre)}
                >
                  Retry
                </button>
              </div>
            ) : !hasSearched ? (
              <div className="empty-state">
                <span className="empty-icon">🔍</span>
                <h3>Discover Online Music</h3>
                <p>Type in the search bar above to find tracks, artists, and remixes.</p>
              </div>
            ) : searchResults.length === 0 && artistResults.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📂</span>
                <h3>No results found for &ldquo;{searchQuery}&rdquo;</h3>
                <p>Try searching with another spelling, artist name, or genre.</p>
              </div>
            ) : (
              <>
                {/* Artist Matches if any */}
                {artistResults.length > 0 && (
                  <div className="artist-results-block">
                    <h4 className="section-title">Artists</h4>
                    <div className="artist-cards-row">
                      {artistResults.map((artist) => (
                        <div
                          key={artist.id}
                          className="artist-card"
                          onClick={() => handleViewArtist(artist)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="artist-card-avatar">
                            {artist.profilePicture ? (
                              <img src={artist.profilePicture} alt="" />
                            ) : (
                              <span>🎤</span>
                            )}
                          </div>
                          <strong>{artist.name}</strong>
                          {artist.handle && <small>@{artist.handle}</small>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Track Matches */}
                <h4 className="section-title">
                  Tracks ({searchResults.length})
                </h4>
                <div className="tracks-grid">
                  {searchResults.map((track) => renderTrackCard(track))}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default OnlineMusic;
