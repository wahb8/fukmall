export function UnsavedChangesModal({
  isOpen,
  onClose,
  onDiscardAndCreateNew,
}) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose} role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Unsaved changes"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Unsaved Changes</p>
            <h2>Create New File?</h2>
          </div>
        </div>
        <div className="modal-body single-column">
          <p className="modal-copy">
            You have unsaved changes. Are you sure you want to create a new file without saving?
          </p>
        </div>
        <div className="modal-actions">
          <button className="action-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="action-button active" type="button" onClick={onDiscardAndCreateNew}>
            Discard and Create New
          </button>
        </div>
      </div>
    </div>
  )
}
