export function SettingsModal({
  isOpen,
  theme,
  trimTransparentImports,
  onClose,
  onToggleTheme,
  onToggleTrimTransparentImports,
}) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose} role="presentation">
      <div
        className="modal-card settings-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Editor Preferences</h2>
          </div>
        </div>
        <div className="modal-body single-column settings-modal-body">
          <button
            className={theme === 'dark' ? 'settings-toggle active' : 'settings-toggle'}
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle dark mode"
          >
            <span>UI Theme</span>
            <strong>{theme === 'dark' ? 'Light UI' : 'Dark UI'}</strong>
          </button>
          <button
            className={trimTransparentImports ? 'settings-toggle active' : 'settings-toggle'}
            type="button"
            onClick={onToggleTrimTransparentImports}
            aria-pressed={trimTransparentImports}
          >
            <span>Trim Transparent Imports</span>
            <strong>{trimTransparentImports ? 'On' : 'Off'}</strong>
          </button>
        </div>
        <div className="modal-actions">
          <button className="action-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
