export function Sidebar({ activeTab, onSelectTab }) {
  const navItems = [
    { id: "home", label: "Home", icon: "🏠" },
    { id: "songs", label: "Songs", icon: "🎵" },
    { id: "albums", label: "Albums", icon: "💿" },
    { id: "artists", label: "Artists", icon: "🎤" },
    { id: "playlists", label: "Playlists", icon: "📂" },
  ];

  return (
    <aside className="sidebar">
      <div className="brand" onClick={() => onSelectTab("songs")}>
        <span className="brand-icon">⚡</span>
        <h1>SyncBeat</h1>
      </div>

      <nav aria-label="Main Navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-button ${activeTab === item.id ? "active" : ""}`}
            onClick={() => onSelectTab(item.id)}
            type="button"
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
