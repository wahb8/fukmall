import { getEditorIcons } from '../../editor/iconAssets'
import { AssetImage } from '../ui/AssetImage'

export function AssetLibraryPanel({
  icons = getEditorIcons('light'),
  assetLibraryInputRef,
  assetLibrary,
  draggedAssetId,
  onImport,
  onInputChange,
  onAssetDragStart,
  onAssetDragEnd,
  onDeleteAsset,
}) {
  return (
    <>
      <input
        ref={assetLibraryInputRef}
        className="sr-only"
        type="file"
        aria-label="Import asset library images"
        accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
        multiple
        onChange={onInputChange}
      />
      <section className="panel-card asset-panel">
        <div className="asset-panel-header">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Assets</p>
              <h2>Library</h2>
            </div>
            <button className="action-button" type="button" onClick={onImport}>
              Import Images
            </button>
          </div>
        </div>

        <div className="asset-panel-body">
          {assetLibrary.length === 0 ? (
            <p className="empty-state asset-empty-state">
              Import PNG, JPG, SVG, or WEBP assets and drag them onto the canvas.
            </p>
          ) : (
            <div className="asset-grid">
              {assetLibrary.map((asset) => (
                <div
                  key={asset.id}
                  className={draggedAssetId === asset.id ? 'asset-card-shell dragging' : 'asset-card-shell'}
                >
                  <button
                    className={draggedAssetId === asset.id ? 'asset-card dragging' : 'asset-card'}
                    type="button"
                    draggable
                    onDragStart={(event) => onAssetDragStart(event, asset)}
                    onDragEnd={onAssetDragEnd}
                    aria-label={asset.name}
                  >
                    <AssetImage
                      className="asset-thumbnail"
                      src={asset.src}
                      alt=""
                      aria-hidden="true"
                      fit="contain"
                    />
                    <div className="asset-card-footer">
                      <span className="asset-name">{asset.name}</span>
                    </div>
                  </button>
                  <button
                    className="asset-delete-button"
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onDeleteAsset(asset.id)
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    aria-label={`Delete ${asset.name} from asset library`}
                  >
                    <img className="button-icon" src={icons.close} alt="" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
