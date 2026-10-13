import { useMemo } from "react";
import TopBar from "../components/TopBar";
import SearchBar from "../components/SearchBar";
import SongList from "../components/SongList";
import EmptyLibrary from "../components/EmptyLibrary";

export function Songs({
  songs = [],
  currentSong,
  isPlaying = false,
  onPlaySong,
  onAddSongs,
  onAddFolder,
  searchQuery = "",
  onSearchChange,
  sortBy = "title",
  onSortChange,
}) {
  const filteredSongs = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    const matches = songs.filter((song) => {
      if (!query) return true;
      return (
        song.name?.toLowerCase().includes(query) ||
        song.artist?.toLowerCase().includes(query) ||
        song.album?.toLowerCase().includes(query) ||
        song.genre?.toLowerCase().includes(query)
      );
    });

    return [...matches].sort((a, b) => {
      if (sortBy === "artist") {
        return (a.artist || "").localeCompare(b.artist || "", undefined, {
          sensitivity: "base",
        });
      }
      if (sortBy === "album") {
        return (a.album || "").localeCompare(b.album || "", undefined, {
          sensitivity: "base",
        });
      }
      return (a.name || "").localeCompare(b.name || "", undefined, {
        sensitivity: "base",
      });
    });
  }, [songs, searchQuery, sortBy]);

  return (
    <div className="page songs-page">
      <TopBar
        title="My Music"
        subtitle={`${songs.length} ${songs.length === 1 ? "song" : "songs"} in your library`}
        onAddSongs={onAddSongs}
        onAddFolder={onAddFolder}
      />

      {songs.length === 0 ? (
        <section className="library">
          <EmptyLibrary onAddSongs={onAddSongs} onAddFolder={onAddFolder} />
        </section>
      ) : (
        <>
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            sortBy={sortBy}
            onSortChange={onSortChange}
          />

          <section className="library">
            <SongList
              songs={filteredSongs}
              currentSong={currentSong}
              isPlaying={isPlaying}
              onPlaySong={onPlaySong}
              searchQuery={searchQuery}
              onClearSearch={() => onSearchChange("")}
            />
          </section>
        </>
      )}
    </div>
  );
}

export default Songs;
