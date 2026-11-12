import SongItem from "./SongItem";

export function SongList({
  songs = [],
  currentSong,
  isPlaying = false,
  onPlaySong,
  searchQuery = "",
  onClearSearch,
}) {
  if (songs.length === 0) {
    if (searchQuery) {
      return (
        <div className="empty-search">
          <div className="empty-search-icon">🔍</div>
          <h3>No matching songs found</h3>
          <p>We couldn't find any songs matching "{searchQuery}".</p>
          {onClearSearch && (
            <button
              className="clear-search-button"
              onClick={onClearSearch}
              type="button"
            >
              Clear Search
            </button>
          )}
        </div>
      );
    }

    return null;
  }

  return (
    <div className="song-list">
      {songs.map((song) => (
        <SongItem
          key={song.path}
          song={song}
          isActive={currentSong?.path === song.path}
          isPlaying={isPlaying}
          onPlay={onPlaySong}
        />
      ))}
    </div>
  );
}

export default SongList;
