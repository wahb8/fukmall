export function FileMenu({
  fileMenuRef,
  isOpen,
  isOpeningFile,
  isExporting,
  theme,
  trimTransparentImports,
  onToggle,
  onToggleTheme,
  onToggleTrimTransparentImports,
  onNewFile,
  onOpenFile,
  onSaveFile,
  onExport,
}) {
  return (
    <div ref={fileMenuRef} className="app-file-menu">
      <button
        className={isOpen ? 'action-button active' : 'action-button'}
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        File
      </button>
      <button
        className={theme === 'dark' ? 'action-button active' : 'action-button'}
        type="button"
        onClick={onToggleTheme}
        aria-label="Toggle dark mode"
      >
        {theme === 'dark' ? 'Light UI' : 'Dark UI'}
      </button>
      {isOpen && (
        <div className="topbar-menu-dropdown" role="menu" aria-label="File">
          <button className="topbar-menu-item" type="button" onClick={onNewFile} role="menuitem">
            New File
          </button>
          <button
            className="topbar-menu-item"
            type="button"
            onClick={onOpenFile}
            disabled={isOpeningFile}
            role="menuitem"
          >
            Open File
          </button>
          <button
            className="topbar-menu-item"
            type="button"
            onClick={onSaveFile}
            role="menuitem"
          >
            Save File
          </button>
          <button
            className="topbar-menu-item"
            type="button"
            onClick={onToggleTrimTransparentImports}
            role="menuitemcheckbox"
            aria-checked={trimTransparentImports}
          >
            {trimTransparentImports ? 'Trim Transparent Imports: On' : 'Trim Transparent Imports: Off'}
          </button>
          <button
            className="topbar-menu-item"
            type="button"
            onClick={() => void onExport('png')}
            disabled={isExporting}
            role="menuitem"
          >
            Export PNG
          </button>
          <button
            className="topbar-menu-item"
            type="button"
            onClick={() => void onExport('jpeg')}
            disabled={isExporting}
            role="menuitem"
          >
            Export JPEG
          </button>
        </div>
      )}
    </div>
  )
}
