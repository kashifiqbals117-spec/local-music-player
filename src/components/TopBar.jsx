export function TopBar({
  title = "My Music",
  subtitle,
  onAddSongs,
  onAddFolder,
  showActions = true,
}) {
  return (
    <header className="top-bar">
      <div className="top-bar-title-section">
        <h2>{title}</h2>
        {subtitle && <p className="library-count">{subtitle}</p>}
      </div>

      {showActions && (
        <div className="import-actions">
          {onAddSongs && (
            <button
              className="add-button"
              onClick={onAddSongs}
              type="button"
              title="Select one or more audio files to import"
            >
              + Add Songs
            </button>
          )}

          {onAddFolder && (
            <button
              className="folder-button"
              onClick={onAddFolder}
              type="button"
              title="Select a directory to scan and import music"
            >
              + Import Folder
            </button>
          )}
        </div>
      )}
    </header>
  );
}

export default TopBar;
