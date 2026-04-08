export function NewFileModal({
  isOpen,
  name,
  width,
  height,
  minDimension,
  onClose,
  onNameChange,
  onWidthChange,
  onHeightChange,
  onCreate,
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
        aria-label="New file dimensions"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">New File</p>
            <h2>Document Size</h2>
          </div>
        </div>
        <div className="modal-body">
          <label className="property-field full-width">
            <span>Name</span>
            <input type="text" value={name} onChange={onNameChange} />
          </label>
          <label className="property-field">
            <span>Width</span>
            <input type="number" min={minDimension} step="1" value={width} onChange={onWidthChange} />
          </label>
          <label className="property-field">
            <span>Height</span>
            <input type="number" min={minDimension} step="1" value={height} onChange={onHeightChange} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="action-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="action-button active" type="button" onClick={onCreate}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
