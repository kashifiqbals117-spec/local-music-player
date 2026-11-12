import { useMemo, useState, useRef, useEffect } from "react";
import TopBar from "../components/TopBar";
import SongItem from "../components/SongItem";
import EmptyLibrary from "../components/EmptyLibrary";
import mediaService from "../services/mediaService";

export function Playlists({
  songs = [],
  currentSong,
  isPlaying = false,
  onPlaySong,
  onAddSongs,
  onAddFolder,
}) {
  const [activePlaylistId, setActivePlaylistId] = useState("all");
  const [covers, setCovers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("syncbeat_playlist_covers") || "{}");
    } catch {
      return {};
    }
  });

  const [isUploading, setIsUploading] = useState(false);
  const [mediaNotice, setMediaNotice] = useState(null);
  const [cloudinaryConfigured, setCloudinaryConfigured] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Check Cloudinary status
    mediaService.getStatus().then((status) => {
      setCloudinaryConfigured(Boolean(status.configured));
    });
  }, []);

  const playlists = useMemo(() => {
    return [
      {
        id: "all",
        name: "All Tracks",
        description: "Complete collection of music files",
        icon: "📁",
        tracks: songs,
      },
      {
        id: "recent",
        name: "Recently Added",
        description: "Latest tracks imported to your player",
        icon: "✨",
        tracks: songs.slice(0, 20),
      },
      {
        id: "long",
        name: "Deep Sessions (> 5 min)",
        description: "Extended cuts and mashups",
        icon: "⏱️",
        tracks: songs.filter((s) => (s.duration || 0) > 300),
      },
      {
        id: "short",
        name: "Quick Bites (< 3 min)",
        description: "Short tracks and interludes",
        icon: "⚡",
        tracks: songs.filter((s) => (s.duration || 0) > 0 && (s.duration || 0) < 180),
      },
    ];
  }, [songs]);

  const currentPlaylist = useMemo(() => {
    return playlists.find((p) => p.id === activePlaylistId) || playlists[0];
  }, [playlists, activePlaylistId]);

  const currentCover = covers[currentPlaylist.id] || null;

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMediaNotice({ type: "info", text: "Uploading cover to Cloudinary..." });

    const result = await mediaService.uploadImage({
      file,
      category: "covers",
      resourceId: currentPlaylist.id,
    });

    setIsUploading(false);

    if (result.success && result.url) {
      const nextCovers = { ...covers, [currentPlaylist.id]: result.url };
      setCovers(nextCovers);
      try {
        localStorage.setItem("syncbeat_playlist_covers", JSON.stringify(nextCovers));
      } catch {
        // Ignore storage quota errors
      }
      setMediaNotice({ type: "success", text: "Cover image updated via Cloudinary!" });
      setTimeout(() => setMediaNotice(null), 4000);
    } else {
      const errMsg = result.configured === false
        ? "Cloudinary not configured in .env. Add credentials to enable cloud uploads."
        : result.error || "Failed to upload image.";
      setMediaNotice({ type: "error", text: errMsg });
      setTimeout(() => setMediaNotice(null), 6000);
    }
  };

  const handleRemoveCover = () => {
    const nextCovers = { ...covers };
    delete nextCovers[currentPlaylist.id];
    setCovers(nextCovers);
    try {
      localStorage.setItem("syncbeat_playlist_covers", JSON.stringify(nextCovers));
    } catch {
      // Ignore storage quota errors
    }
    setMediaNotice({ type: "info", text: "Cover image removed." });
    setTimeout(() => setMediaNotice(null), 3000);
  };

  return (
    <div className="page playlists-page">
      <TopBar
        title="Playlists"
        subtitle={`${playlists.length} smart playlists available`}
        onAddSongs={onAddSongs}
        onAddFolder={onAddFolder}
      />

      <section className="library">
        {songs.length === 0 ? (
          <EmptyLibrary onAddSongs={onAddSongs} onAddFolder={onAddFolder} />
        ) : (
          <div className="playlists-layout">
            <div className="playlists-sidebar-nav">
              {playlists.map((playlist) => {
                const itemCover = covers[playlist.id];
                return (
                  <button
                    key={playlist.id}
                    type="button"
                    className={`playlist-nav-item ${
                      activePlaylistId === playlist.id ? "active" : ""
                    }`}
                    onClick={() => setActivePlaylistId(playlist.id)}
                  >
                    {itemCover ? (
                      <img
                        src={itemCover}
                        alt=""
                        className="playlist-nav-thumb"
                        style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }}
                      />
                    ) : (
                      <span className="playlist-nav-icon">{playlist.icon}</span>
                    )}
                    <div className="playlist-nav-info">
                      <strong>{playlist.name}</strong>
                      <small>{playlist.tracks.length} tracks</small>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="playlist-tracks-view">
              <div className="playlist-header-banner">
                <div className="playlist-banner-art" style={{ overflow: "hidden" }}>
                  {currentCover ? (
                    <img
                      src={currentCover}
                      alt={currentPlaylist.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    currentPlaylist.icon
                  )}
                </div>
                <div className="playlist-banner-meta">
                  <h3>{currentPlaylist.name}</h3>
                  <p>{currentPlaylist.description}</p>
                  <small>{currentPlaylist.tracks.length} songs</small>

                  <div style={{ display: "flex", gap: "10px", marginTop: "8px", alignItems: "center" }}>
                    {currentPlaylist.tracks.length > 0 && (
                      <button
                        type="button"
                        className="add-button"
                        onClick={() => onPlaySong(currentPlaylist.tracks[0])}
                      >
                        ▶ Play Playlist
                      </button>
                    )}

                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: "none" }}
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleFileChange}
                    />

                    <button
                      type="button"
                      className="folder-button"
                      onClick={handleUploadClick}
                      disabled={isUploading}
                      title={cloudinaryConfigured ? "Upload cover to Cloudinary" : "Cloudinary not configured in .env"}
                    >
                      {isUploading ? "⏳ Uploading..." : currentCover ? "🖼️ Change Cover" : "☁️ Upload Cover"}
                    </button>

                    {currentCover && (
                      <button
                        type="button"
                        className="folder-button"
                        onClick={handleRemoveCover}
                        style={{ color: "#ff6b6b" }}
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>

                  {mediaNotice && (
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "12px",
                        color:
                          mediaNotice.type === "error"
                            ? "#ff6b6b"
                            : mediaNotice.type === "success"
                            ? "#51cf66"
                            : "#adb5bd",
                      }}
                    >
                      {mediaNotice.text}
                    </div>
                  )}
                </div>
              </div>

              {currentPlaylist.tracks.length === 0 ? (
                <div className="empty-search">
                  <p>No tracks currently meet this playlist's criteria.</p>
                </div>
              ) : (
                <div className="song-list">
                  {currentPlaylist.tracks.map((song) => (
                    <SongItem
                      key={song.path}
                      song={song}
                      isActive={currentSong?.path === song.path}
                      isPlaying={isPlaying}
                      onPlay={onPlaySong}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default Playlists;
