import { useState } from "react";
import userLibrary from "../services/userLibraryService";

export function SyncKeyModal({ isOpen, onClose }) {
  const [syncKeyInput, setSyncKeyInput] = useState("");
  const [syncStatus, setSyncStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentKey = userLibrary.getSyncKey() || "SB-SYNC01";

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleLinkKey = async (e) => {
    e.preventDefault();
    const cleanKey = syncKeyInput.trim().toUpperCase();
    if (!cleanKey) return;

    setIsSubmitting(true);
    setSyncStatus(null);

    const result = await userLibrary.syncWithKey(cleanKey);
    setIsSubmitting(false);

    if (result.success) {
      setSyncStatus({ type: "success", text: result.message || "Library synced successfully!" });
      setTimeout(() => {
        onClose();
        setSyncStatus(null);
      }, 2000);
    } else {
      setSyncStatus({ type: "error", text: result.error || "Failed to sync library." });
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content sync-key-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>🔄 Cross-Device Library Sync</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <p className="muted">
            Pair your devices using a <strong>Sync Key</strong> to access your Liked Songs and Playlists anywhere without signing in.
          </p>

          <div className="sync-key-display-box">
            <span className="sync-key-label">Your Device's Sync Key:</span>
            <div className="sync-key-row">
              <code className="sync-key-code">{currentKey}</code>
              <button type="button" className="copy-btn" onClick={handleCopy}>
                {copied ? "✔ Copied!" : "📋 Copy"}
              </button>
            </div>
            <span className="sync-key-hint">Enter this key on your phone or other computer to load your library.</span>
          </div>

          <div className="sync-divider">
            <span>OR CONNECT TO AN EXISTING KEY</span>
          </div>

          <form onSubmit={handleLinkKey} className="sync-key-form">
            <label htmlFor="sync-key-input">Enter Sync Key from another device:</label>
            <div className="sync-input-row">
              <input
                id="sync-key-input"
                type="text"
                placeholder="e.g. SB-A1B2C3"
                value={syncKeyInput}
                onChange={(e) => setSyncKeyInput(e.target.value.toUpperCase())}
                maxLength={12}
                disabled={isSubmitting}
              />
              <button
                type="submit"
                className="add-button"
                disabled={!syncKeyInput.trim() || isSubmitting}
              >
                {isSubmitting ? "Linking..." : "Link Library"}
              </button>
            </div>
          </form>

          {syncStatus && (
            <div className={`sync-status-msg ${syncStatus.type}`}>
              {syncStatus.type === "success" ? "✔" : "⚠️"} {syncStatus.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SyncKeyModal;
