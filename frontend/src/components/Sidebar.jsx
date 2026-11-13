export function Sidebar({
  activeTab,
  onSelectTab,
  appMode = "offline",
  onOpenModeSelect,
  onOpenSyncModal,
}) {
  const offlineNavItems = [
    { id: "home", label: "Home", icon: "🏠" },
    { id: "songs", label: "Songs", icon: "🎵" },
    { id: "albums", label: "Albums", icon: "💿" },
    { id: "artists", label: "Artists", icon: "🎤" },
    { id: "playlists", label: "Playlists", icon: "📂" },
    { id: "sync", label: "Sync Sessions", icon: "⚡" },
  ];

  const onlineNavItems = [
    { id: "online-home", label: "Home", icon: "🏠" },
    { id: "online-search", label: "Search", icon: "🔍" },
    { id: "online-discover", label: "Discover", icon: "🌐" },
    { id: "liked-songs", label: "Liked Songs", icon: "❤️" },
    { id: "online-playlists", label: "Your Playlists", icon: "📂" },
    { id: "recently-played", label: "Recently Played", icon: "🕒" },
    { id: "sync", label: "Sync Sessions", icon: "⚡" },
  ];

  const navItems = appMode === "online" ? onlineNavItems : offlineNavItems;

  return (
    <aside className="sidebar">
      <div className="brand" onClick={() => onSelectTab(appMode === "online" ? "online-home" : "songs")}>
        <span className="brand-icon">⚡</span>
        <div className="brand-text">
          <h1>SyncBeat</h1>
          <span className="brand-version">2.0</span>
        </div>
      </div>

      {/* Mode Switcher Pill */}
      <div className="sidebar-mode-switcher">
        <button
          type="button"
          className={`mode-pill ${appMode === "online" ? "pill-online" : "pill-offline"}`}
          onClick={onOpenModeSelect}
          title="Click to switch between Offline and Online modes"
        >
          <span className="pill-dot">●</span>
          <span className="pill-mode-name">
            {appMode === "online" ? "⚡ Online Mode" : "💻 Offline Mode"}
          </span>
          <span className="pill-switch-tag">Switch ⇄</span>
        </button>
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

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        {appMode === "online" ? (
          <button
            type="button"
            className="sync-key-pill-btn"
            onClick={onOpenSyncModal}
            title="Pair library across your phone and devices"
          >
            <span className="sync-icon">🔄</span>
            <span className="sync-text">Device Sync Key</span>
          </button>
        ) : (
          <div className="offline-network-badge">
            <span className="badge-dot">●</span>
            <span>Local Network Mode</span>
          </div>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
