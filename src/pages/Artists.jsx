import { useMemo, useState } from "react";
import TopBar from "../components/TopBar";
import SongItem from "../components/SongItem";
import EmptyLibrary from "../components/EmptyLibrary";

export function Artists({
  songs = [],
  currentSong,
  isPlaying = false,
  onPlaySong,
  onAddSongs,
  onAddFolder,
}) {
  const [selectedArtist, setSelectedArtist] = useState(null);

  const artistsMap = useMemo(() => {
    const map = new Map();

    for (const song of songs) {
      const artistName = song.artist || "Unknown Artist";
      if (!map.has(artistName)) {
        map.set(artistName, {
          name: artistName,
          tracks: [],
        });
      }
      map.get(artistName).tracks.push(song);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }, [songs]);

  const activeArtistData = useMemo(() => {
    if (!selectedArtist) return null;
    return artistsMap.find((a) => a.name === selectedArtist);
  }, [artistsMap, selectedArtist]);

  return (
    <div className="page artists-page">
      <TopBar
        title={selectedArtist ? selectedArtist : "Artists"}
        subtitle={
          selectedArtist
            ? `${activeArtistData?.tracks.length || 0} tracks available`
            : `${artistsMap.length} ${artistsMap.length === 1 ? "artist" : "artists"} in library`
        }
        onAddSongs={onAddSongs}
        onAddFolder={onAddFolder}
      />

      <section className="library">
        {songs.length === 0 ? (
          <EmptyLibrary onAddSongs={onAddSongs} onAddFolder={onAddFolder} />
        ) : selectedArtist && activeArtistData ? (
          <div className="artist-detail-view">
            <button
              type="button"
              className="back-button"
              onClick={() => setSelectedArtist(null)}
            >
              ← Back to all artists
            </button>

            <div className="artist-detail-header">
              <div className="artist-art-large">🎤</div>
              <div className="artist-detail-meta">
                <h3>{activeArtistData.name}</h3>
                <p>
                  {activeArtistData.tracks.length}{" "}
                  {activeArtistData.tracks.length === 1 ? "track" : "tracks"}
                </p>
                <button
                  type="button"
                  className="add-button"
                  onClick={() => onPlaySong(activeArtistData.tracks[0])}
                >
                  ▶ Play Artist
                </button>
              </div>
            </div>

            <div className="song-list">
              {activeArtistData.tracks.map((song) => (
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
            {artistsMap.map((artist) => (
              <div
                key={artist.name}
                className="collection-card"
                onClick={() => setSelectedArtist(artist.name)}
              >
                <div className="collection-card-art artist-avatar">🎤</div>
                <div className="collection-card-info">
                  <strong title={artist.name}>{artist.name}</strong>
                  <small>
                    {artist.tracks.length}{" "}
                    {artist.tracks.length === 1 ? "track" : "tracks"}
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

export default Artists;
