import { useState, useEffect, useRef, useCallback } from "react";
import api from "../services/api";
import userLibrary from "../services/userLibraryService";
import { formatTime } from "../utils/formatTime";

const POPULAR_GENRES = [
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

export function OnlineSearch({
  onPlaySong,
  onAddToQueue,
  currentSong,
  isPlaying,
  syncSession,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [trackResults, setTrackResults] = useState([]);
  const [artistResults, setArtistResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected artist inspection
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [artistTracks, setArtistTracks] = useState([]);
  const [isArtistLoading, setIsArtistLoading] = useState(false);

  // Playlist adder dropdown
  const [activePlaylistMenuTrackId, setActivePlaylistMenuTrackId] = useState(null);
  const [librarySnapshot, setLibrarySnapshot] = useState(() => userLibrary.getSnapshot());

  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    const unsub = userLibrary.subscribe(setLibrarySnapshot);
    return unsub;
  }, []);

  const executeSearch = useCallback(async (query, genre) => {
    const cleanQuery = (query || "").trim();
    if (!cleanQuery) {
      setTrackResults([]);
      setArtistResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);
    setSelectedArtist(null);

    try {
      const g = genre === "All" ? undefined : genre;
      const [musicData, artistData] = await Promise.allSettled([
        api.searchMusic({ query: cleanQuery, genre: g, limit: 30 }),
        api.searchArtists({ query: cleanQuery, limit: 5 }),
      ]);

      if (musicData.status === "fulfilled") {
        setTrackResults(musicData.value?.tracks || []);
      } else {
        setTrackResults([]);
        console.warn("Music search error:", musicData.reason);
      }

      if (artistData.status === "fulfilled") {
        setArtistResults(artistData.value?.artists || []);
      } else {
        setArtistResults([]);
      }
    } catch (err) {
      console.error("Online search failed:", err);
      setSearchError(err.message || "Failed to search Audius.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced input change
  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      executeSearch(val, selectedGenre);
    }, 400);
  };

  // Genre pill click
  const handleGenreSelect = (genre) => {
    setSelectedGenre(genre);
    if (searchQuery.trim()) {
      executeSearch(searchQuery, genre);
    }
  };

  // Click on artist to view top tracks
  const handleSelectArtist = async (artist) => {
    setSelectedArtist(artist);
    setIsArtistLoading(true);
    try {
      const data = await api.getArtistTracks(artist.id, 20);
      setArtistTracks(data?.tracks || []);
    } catch (err) {
      console.error("Could not load artist tracks:", err);
    } finally {
      setIsArtistLoading(false);
    }
  };

  const handleAddToPlaylist = (playlistId, track) => {
    userLibrary.addTrackToPlaylist(playlistId, track);
    setActivePlaylistMenuTrackId(null);
  };

  return (
    <div className="page online-search-page">
      <header className="page-header">
        <div className="header-title-row">
          <div>
            <h1>Online Search</h1>
            <p className="muted">Search over 1,000,000+ indie releases on Audius</p>
          </div>
        </div>

        {/* Search Bar Input */}
        <div className="online-search-bar-wrap">
          <span className="search-input-icon">🔍</span>
          <input
            type="search"
            className="online-search-input"
            placeholder="Search tracks, artists, remixes, genres..."
            value={searchQuery}
            onChange={handleInputChange}
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setSearchQuery("");
                setTrackResults([]);
                setArtistResults([]);
                setHasSearched(false);
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Genre quick chips */}
        <div className="genre-chips-scroll">
          {POPULAR_GENRES.map((g) => (
            <button
              key={g}
              type="button"
              className={`genre-chip ${selectedGenre === g ? "active" : ""}`}
              onClick={() => handleGenreSelect(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </header>

      {/* Loading state */}
      {isSearching && (
        <div className="online-loading-spinner">
          <span className="spinner">⏳</span>
          <p>Searching Audius catalog...</p>
        </div>
      )}

      {/* Error state */}
      {searchError && (
        <div className="online-error-box">
          <span>⚠️ {searchError}</span>
        </div>
      )}

      {/* Artist Spotlight results */}
      {!isSearching && artistResults.length > 0 && (
        <section className="search-artists-section">
          <h3 className="section-title-sub">Artists Found</h3>
          <div className="search-artists-grid">
            {artistResults.map((artist) => (
              <div
                key={artist.id}
                className={`artist-pill-card ${selectedArtist?.id === artist.id ? "selected" : ""}`}
                onClick={() => handleSelectArtist(artist)}
              >
                <div className="artist-avatar">
                  {artist.artwork ? <img src={artist.artwork} alt={artist.name} /> : "🎤"}
                </div>
                <div className="artist-details">
                  <span className="artist-name">{artist.name}</span>
                  <span className="artist-handle">@{artist.handle}</span>
                  {artist.followerCount > 0 && (
                    <span className="artist-followers">
                      {artist.followerCount.toLocaleString()} followers
                    </span>
                  )}
                </div>
                <span className="artist-view-arrow">→</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Selected Artist Tracks Inspector */}
      {selectedArtist && (
        <section className="artist-inspector-card">
          <div className="inspector-header">
            <div className="inspector-avatar">
              {selectedArtist.artwork ? (
                <img src={selectedArtist.artwork} alt={selectedArtist.name} />
              ) : (
                "🎤"
              )}
            </div>
            <div className="inspector-info">
              <h2>{selectedArtist.name}</h2>
              <span className="inspector-handle">@{selectedArtist.handle}</span>
              {selectedArtist.bio && <p className="inspector-bio">{selectedArtist.bio}</p>}
            </div>
            <button
              type="button"
              className="close-inspector-btn"
              onClick={() => setSelectedArtist(null)}
            >
              ✕ Close
            </button>
          </div>

          <h4 className="inspector-tracks-heading">Top Tracks by {selectedArtist.name}</h4>
          {isArtistLoading ? (
            <p className="muted">Loading tracks...</p>
          ) : artistTracks.length === 0 ? (
            <p className="muted">No tracks found for this artist.</p>
          ) : (
            <div className="tracks-list-compact">
              {artistTracks.map((trk) => {
                const isCur = (currentSong?.id || currentSong?.streamUrl) === trk.id;
                const isLiked = userLibrary.isLiked(trk.id);

                return (
                  <div key={trk.id} className={`track-row ${isCur ? "playing-row" : ""}`}>
                    <button
                      type="button"
                      className="track-play-btn"
                      onClick={() => onPlaySong(trk)}
                    >
                      {isCur && isPlaying ? "⏸" : "▶"}
                    </button>
                    <div className="track-title-col">
                      <span className="track-name">{trk.title}</span>
                      <span className="track-artist-sub">{trk.artist}</span>
                    </div>
                    <span className="track-duration-col">{formatTime(trk.duration)}</span>
                    <button
                      type="button"
                      className={`track-heart-btn ${isLiked ? "liked" : ""}`}
                      onClick={() => userLibrary.toggleLike(trk)}
                      title={isLiked ? "Unlike" : "Like"}
                    >
                      {isLiked ? "❤️" : "🤍"}
                    </button>
                    <button
                      type="button"
                      className="track-action-btn"
                      onClick={() => onAddToQueue(trk)}
                      title="Add to queue"
                    >
                      ➕ Queue
                    </button>
                    {syncSession?.session && (
                      <button
                        type="button"
                        className="track-session-btn"
                        onClick={() => syncSession.addToSessionQueue(trk)}
                        title="Add to shared room queue"
                      >
                        ⚡ Room
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Track Results */}
      {!isSearching && hasSearched && (
        <section className="search-tracks-section">
          <div className="section-header-row">
            <h3 className="section-title-sub">
              Track Results ({trackResults.length})
            </h3>
          </div>

          {trackResults.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🔍</span>
              <h3>No tracks found</h3>
              <p className="muted">
                Try searching for a different track title, artist name, or genre.
              </p>
            </div>
          ) : (
            <div className="tracks-table-wrap">
              <table className="tracks-table">
                <thead>
                  <tr>
                    <th style={{ width: "48px" }}></th>
                    <th style={{ width: "48px" }}>Art</th>
                    <th>Title</th>
                    <th>Artist</th>
                    <th>Duration</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trackResults.map((track) => {
                    const isCur = (currentSong?.id || currentSong?.streamUrl) === (track.id || track.streamUrl);
                    const isLiked = userLibrary.isLiked(track.id);

                    return (
                      <tr key={track.id} className={isCur ? "active-track-row" : ""}>
                        <td>
                          <button
                            type="button"
                            className="table-play-btn"
                            onClick={() => onPlaySong(track)}
                            aria-label={`Play ${track.title}`}
                          >
                            {isCur && isPlaying ? "⏸" : "▶"}
                          </button>
                        </td>
                        <td>
                          <div className="table-art">
                            {track.artwork ? (
                              <img src={track.artwork} alt="" loading="lazy" />
                            ) : (
                              <span>🌐</span>
                            )}
                          </div>
                        </td>
                        <td className="track-title-cell">
                          <strong>{track.title}</strong>
                        </td>
                        <td className="track-artist-cell">{track.artist}</td>
                        <td className="track-duration-cell">{formatTime(track.duration)}</td>
                        <td className="track-actions-cell" style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className={`table-action-icon-btn ${isLiked ? "liked" : ""}`}
                            onClick={() => userLibrary.toggleLike(track)}
                            title={isLiked ? "Unlike" : "Like"}
                          >
                            {isLiked ? "❤️" : "🤍"}
                          </button>

                          <button
                            type="button"
                            className="table-action-icon-btn"
                            onClick={() => onAddToQueue(track)}
                            title="Add to player queue"
                          >
                            ➕
                          </button>

                          {/* Add to Playlist button & dropdown */}
                          <div className="playlist-menu-wrap">
                            <button
                              type="button"
                              className="table-action-icon-btn"
                              onClick={() =>
                                setActivePlaylistMenuTrackId(
                                  activePlaylistMenuTrackId === track.id ? null : track.id
                                )
                              }
                              title="Add to playlist"
                            >
                              📂
                            </button>
                            {activePlaylistMenuTrackId === track.id && (
                              <div className="playlist-dropdown-menu">
                                <span className="dropdown-title">Add to Playlist:</span>
                                {librarySnapshot.playlists?.map((pl) => (
                                  <button
                                    key={pl.id}
                                    type="button"
                                    className="dropdown-item"
                                    onClick={() => handleAddToPlaylist(pl.id, track)}
                                  >
                                    {pl.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {syncSession?.session && (
                            <button
                              type="button"
                              className="table-session-btn"
                              onClick={() => syncSession.addToSessionQueue(track)}
                              title="Add to shared room queue"
                            >
                              ⚡ Room
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Initial state before typing */}
      {!hasSearched && !isSearching && (
        <div className="search-initial-hero">
          <div className="hero-search-graphic">🎧</div>
          <h3>Search the Audius Decentralized Catalog</h3>
          <p className="muted">
            Find trending EDM, hip-hop, ambient, and indie tracks from independent creators worldwide.
          </p>
        </div>
      )}
    </div>
  );
}

export default OnlineSearch;
