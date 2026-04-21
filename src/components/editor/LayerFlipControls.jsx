export function LayerFlipControls({
  onFlipHorizontal,
  onFlipVertical,
}) {
  return (
    <div className="property-field full-width">
      <span>Flip</span>
      <div className="segmented-control segmented-control-two-up" role="group" aria-label="Layer flip controls">
        <button
          className="segmented-control-button"
          type="button"
          onClick={onFlipHorizontal}
        >
          Flip Horizontal
        </button>
        <button
          className="segmented-control-button"
          type="button"
          onClick={onFlipVertical}
        >
          Flip Vertical
        </button>
      </div>
    </div>
  )
}
