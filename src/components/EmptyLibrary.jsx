export function EmptyLibrary({
  onAddSongs,
  onAddFolder,
  title = "Your library is empty",
  message = "Add some music from your computer to get started.",
}) {
  return (
    <div className="empty-library">
      <div className="empty-icon">🎵</div>

      <h2>{title}</h2>

      <p>{message}</p>

      <div className="empty-actions">
        {onAddSongs && (
          <button className="add-button" onClick={onAddSongs} type="button">
            + Add Music
          </button>
        )}

        {onAddFolder && (
          <button className="folder-button" onClick={onAddFolder} type="button">
            + Import Folder
          </button>
        )}
      </div>
    </div>
  );
}

export default EmptyLibrary;
