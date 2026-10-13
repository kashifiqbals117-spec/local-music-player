import { useMemo, useState } from "react";
import TopBar from "../components/TopBar";
import SongItem from "../components/SongItem";
import EmptyLibrary from "../components/EmptyLibrary";

export function Albums({
  songs = [],
  currentSong,
  isPlaying = false,
  onPlaySong,
  onAddSongs,
  onAddFolder,
}) {
  const [selectedAlbum, setSelectedAlbum] = useState(null);

  const albumsMap = useMemo(() => {
    const map = new Map();

    for (const song of songs) {
      const albumName = song.album || "Unknown Album";
      if (!map.has(albumName)) {
        map.set(albumName, {
          name: albumName,
          artist: song.artist || "Unknown Artist",
          tracks: [],
        });
      }
      map.get(albumName).tracks.push(song);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }, [songs]);

  const activeAlbumData = useMemo(() => {
    if (!selectedAlbum) return null;
    return albumsMap.find((a) => a.name === selectedAlbum);
  }, [albumsMap, selectedAlbum]);

  return (
    <div className="page albums-page">
      <TopBar
        title={selectedAlbum ? selectedAlbum : "Albums"}
        subtitle={
          selectedAlbum
            ? `${activeAlbumData?.tracks.length || 0} tracks • By ${activeAlbumData?.artist || "Unknown Artist"}`
            : `${albumsMap.length} ${albumsMap.length === 1 ? "album" : "albums"} in library`
        }
        onAddSongs={onAddSongs}
        onAddFolder={onAddFolder}
      />

      <section className="library">
        {songs.length === 0 ? (
          <EmptyLibrary onAddSongs={onAddSongs} onAddFolder={onAddFolder} />
        ) : selectedAlbum && activeAlbumData ? (
          <div className="album-detail-view">
            <button
              type="button"
              className="back-button"
              onClick={() => setSelectedAlbum(null)}
            >
              ← Back to all albums
            </button>

            <div className="album-detail-header">
              <div className="album-art-large">💿</div>
              <div className="album-detail-meta">
                <h3>{activeAlbumData.name}</h3>
                <p>{activeAlbumData.artist}</p>
                <button
                  type="button"
                  className="add-button"
                  onClick={() => onPlaySong(activeAlbumData.tracks[0])}
                >
                  ▶ Play Album
                </button>
              </div>
            </div>

            <div className="song-list">
              {activeAlbumData.tracks.map((song) => (
                <SongItem
                  key={song.path}
                  song={song}
                  isActive={currentSong?.path === song.path}
                  isPlaying={isPlaying}
                  onPlay={onPlaySong}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="collection-grid">
            {albumsMap.map((album) => (
              <div
                key={album.name}
                className="collection-card"
                onClick={() => setSelectedAlbum(album.name)}
              >
                <div className="collection-card-art">💿</div>
                <div className="collection-card-info">
                  <strong title={album.name}>{album.name}</strong>
                  <span title={album.artist}>{album.artist}</span>
                  <small>
                    {album.tracks.length}{" "}
                    {album.tracks.length === 1 ? "track" : "tracks"}
                  </small>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Albums;
