import addLayerIcon from '../../assets/add layer.svg'
import closeIcon from '../../assets/Close (X).svg'
import duplicateIcon from '../../assets/duplicate.svg'
import downIcon from '../../assets/down.svg'
import hiddenIcon from '../../assets/Hidden.svg'
import mergeDownIcon from '../../assets/merge down.svg'
import upIcon from '../../assets/up.svg'
import visibleIcon from '../../assets/Visible.svg'
import {
  canMergeDown,
  duplicateLayer,
  isAlphaLocked,
  isLayerSelected,
  moveLayer,
  removeLayer,
  updateLayer,
} from '../../lib/layers'

function getLayerRowClassName({ isSelected, isDragging, dropPlacement }) {
  return [
    'layer-row',
    isSelected ? 'selected' : '',
    isDragging ? 'dragging' : '',
    dropPlacement === 'before' ? 'drop-before' : '',
    dropPlacement === 'after' ? 'drop-after' : '',
  ].filter(Boolean).join(' ')
}

export function LayerPanel({
  documentState,
  documentWidth,
  documentHeight,
  draggedLayerId,
  layerDropTarget,
  addLayer,
  applyDocumentChange,
  createRasterLayer,
  handleLayerDragEnd,
  handleLayerDragOver,
  handleLayerDragStart,
  handleLayerDrop,
  handleMergeDown,
  onSelectLayer,
  onToggleLayerSelection,
}) {
  return (
    <section className="panel-card">
      <div className="layer-list">
        {[...documentState.layers].reverse().map((layer) => {
          const actualIndex = documentState.layers.findIndex((candidate) => candidate.id === layer.id)
          const isTop = actualIndex === documentState.layers.length - 1
          const isBottom = actualIndex === 0
          const isSelected = isLayerSelected(documentState, layer.id)
          const isDragging = layer.id === draggedLayerId
          const dropPlacement = layerDropTarget?.layerId === layer.id
            ? layerDropTarget.placement
            : null

          return (
            <div
              key={layer.id}
              className={getLayerRowClassName({ isSelected, isDragging, dropPlacement })}
              draggable
              onClick={(event) => {
                if (event.shiftKey) {
                  onToggleLayerSelection(layer.id)
                  return
                }

                onSelectLayer(layer.id)
              }}
              onDragStart={(event) => handleLayerDragStart(event, layer.id)}
              onDragOver={(event) => handleLayerDragOver(event, layer.id)}
              onDrop={(event) => handleLayerDrop(event, layer.id, actualIndex)}
              onDragEnd={handleLayerDragEnd}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  if (event.shiftKey) {
                    onToggleLayerSelection(layer.id)
                    return
                  }

                  onSelectLayer(layer.id)
                }
              }}
              role="button"
              tabIndex={0}
            >
              <button
                className={layer.visible ? 'icon-button' : 'icon-button muted'}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  applyDocumentChange((currentDocument) =>
                    updateLayer(currentDocument, layer.id, {
                      visible: !layer.visible,
                    }),
                  )
                }}
                aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
              >
                <img
                  className="button-icon"
                  src={layer.visible ? visibleIcon : hiddenIcon}
                  alt=""
                  aria-hidden="true"
                />
              </button>

              <div className="layer-meta">
                <input
                  className="layer-name-input"
                  type="text"
                  value={layer.name}
                  onChange={(event) =>
                    applyDocumentChange((currentDocument) =>
                      updateLayer(currentDocument, layer.id, {
                        name: event.target.value,
                      }),
                    )
                  }
                  onClick={(event) => event.stopPropagation()}
                  draggable={false}
                />
                <div className="layer-chip-row">
                  {isAlphaLocked(layer) && (
                    <span className="layer-flag-chip">alpha lock</span>
                  )}
                  {layer.linkedLayerId && (
                    <span className="layer-flag-chip">linked</span>
                  )}
                </div>
              </div>

              <div className="row-actions">
                <button
                  className="icon-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    applyDocumentChange((currentDocument) => duplicateLayer(currentDocument, layer.id))
                  }}
                  aria-label="Duplicate layer"
                >
                  <img className="button-icon" src={duplicateIcon} alt="" aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  disabled={isTop}
                  onClick={(event) => {
                    event.stopPropagation()
                    applyDocumentChange((currentDocument) => moveLayer(currentDocument, layer.id, 'up'))
                  }}
                  aria-label="Move layer up"
                >
                  <img className="button-icon" src={upIcon} alt="" aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  disabled={isBottom}
                  onClick={(event) => {
                    event.stopPropagation()
                    applyDocumentChange((currentDocument) => moveLayer(currentDocument, layer.id, 'down'))
                  }}
                  aria-label="Move layer down"
                >
                  <img className="button-icon" src={downIcon} alt="" aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  disabled={!canMergeDown(documentState, layer.id)}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleMergeDown(layer.id)
                  }}
                  aria-label="Merge layer down"
                >
                  <img className="button-icon" src={mergeDownIcon} alt="" aria-hidden="true" />
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    applyDocumentChange((currentDocument) => removeLayer(currentDocument, layer.id))
                  }}
                  aria-label="Delete layer"
                >
                  <img className="button-icon" src={closeIcon} alt="" aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="layer-panel-footer">
        <button
          className="action-button layer-panel-add-button"
          type="button"
          onClick={() =>
            addLayer(() =>
              createRasterLayer({
                name: 'Drawing Layer',
                width: documentWidth,
                height: documentHeight,
              }),
            )
          }
          aria-label="Add Drawing"
        >
          <img className="button-icon" src={addLayerIcon} alt="" aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
