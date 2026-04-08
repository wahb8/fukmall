export function ExternalImageDropOverlay({ isVisible }) {
  if (!isVisible) {
    return null
  }

  return (
    <div className="external-image-drop-overlay" aria-hidden="true">
      <div className="external-image-drop-card">
        <p className="eyebrow">Import Image</p>
        <strong>Drag and drop to import image</strong>
      </div>
    </div>
  )
}
