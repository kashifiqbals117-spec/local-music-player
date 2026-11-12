export function SearchBar({
  searchQuery = "",
  onSearchChange,
  sortBy = "title",
  onSortChange,
  placeholder = "Search songs, artists, albums...",
}) {
  return (
    <div className="library-toolbar">
      <div className="search-input-wrapper">
        <span className="search-icon">🔍</span>
        <input
          type="search"
          className="search-input"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search music library"
        />
        {searchQuery && (
          <button
            type="button"
            className="clear-search-btn"
            onClick={() => onSearchChange("")}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {onSortChange && (
        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          aria-label="Sort songs"
        >
          <option value="title">Sort: Title</option>
          <option value="artist">Sort: Artist</option>
          <option value="album">Sort: Album</option>
        </select>
      )}
    </div>
  );
}

export default SearchBar;
