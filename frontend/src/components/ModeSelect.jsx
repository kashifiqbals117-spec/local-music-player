import { useState } from "react";

export function ModeSelect({ onSelectMode, initialRemember = true, onCancel = null }) {
  const [remember, setRemember] = useState(initialRemember);

  const handleChoose = (mode) => {
    if (remember) {
      try {
        localStorage.setItem("syncbeat_preferred_mode", mode);
      } catch (err) {
        console.warn("Could not save mode preference:", err);
      }
    }
    onSelectMode(mode);
  };

  return (
    <div className="mode-select-overlay">
      <div className="mode-select-modal">
        <header className="mode-select-header">
          <div className="mode-brand">
            <span className="mode-logo-glow">⚡</span>
            <h2>Welcome to SyncBeat 2.0</h2>
          </div>
          <p className="mode-subtitle">
            Choose your listening experience. You can switch between modes at any time.
          </p>
        </header>

        <div className="mode-cards-container">
          {/* OFFLINE MODE CARD */}
          <div
            className="mode-card mode-card-offline"
            onClick={() => handleChoose("offline")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleChoose("offline");
            }}
          >
            <div className="mode-card-badge">Local Network</div>
            <div className="mode-card-icon-wrap">
              <span className="mode-card-icon">💻</span>
            </div>
            <h3 className="mode-card-title">Offline Mode</h3>
            <p className="mode-card-desc">
              "Your music. Your library. Your local network."
            </p>

            <ul className="mode-features-list">
              <li>
                <span className="feat-check">✔</span> Import local music &amp; folders
              </li>
              <li>
                <span className="feat-check">✔</span> Organize by Songs, Albums &amp; Artists
              </li>
              <li>
                <span className="feat-check">✔</span> Create offline custom playlists
              </li>
              <li>
                <span className="feat-check">✔</span> Host local listening sessions
              </li>
              <li>
                <span className="feat-check">✔</span> Connect devices over Wi-Fi / LAN
              </li>
              <li>
                <span className="feat-check">✔</span> Listen together without internet access
              </li>
            </ul>

            <button
              type="button"
              className="mode-launch-btn mode-launch-offline"
              onClick={(e) => {
                e.stopPropagation();
                handleChoose("offline");
              }}
            >
              Launch Offline Mode →
            </button>
          </div>

          {/* ONLINE MODE CARD */}
          <div
            className="mode-card mode-card-online"
            onClick={() => handleChoose("online")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleChoose("online");
            }}
          >
            <div className="mode-card-badge mode-badge-cyan">Audius Cloud</div>
            <div className="mode-card-icon-wrap">
              <span className="mode-card-icon">⚡</span>
            </div>
            <h3 className="mode-card-title">Online Mode</h3>
            <p className="mode-card-desc">
              "Discover music. Create playlists. Listen together anywhere."
            </p>

            <ul className="mode-features-list">
              <li>
                <span className="feat-check">✔</span> Stream 1M+ online tracks via Audius
              </li>
              <li>
                <span className="feat-check">✔</span> Search tracks, artists &amp; trending charts
              </li>
              <li>
                <span className="feat-check">✔</span> Like songs &amp; build persistent playlists
              </li>
              <li>
                <span className="feat-check">✔</span> Create online listening rooms
              </li>
              <li>
                <span className="feat-check">✔</span> Invite friends through QR codes &amp; links
              </li>
              <li>
                <span className="feat-check">✔</span> Cross-device Sync Key pairing
              </li>
            </ul>

            <button
              type="button"
              className="mode-launch-btn mode-launch-online"
              onClick={(e) => {
                e.stopPropagation();
                handleChoose("online");
              }}
            >
              Launch Online Mode →
            </button>
          </div>
        </div>

        <footer className="mode-select-footer">
          <label className="remember-checkbox-label">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Remember my choice on this device</span>
          </label>

          {onCancel && (
            <button
              type="button"
              className="mode-cancel-btn"
              onClick={onCancel}
            >
              Stay on current mode
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export default ModeSelect;
