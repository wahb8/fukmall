import { useEffect, useRef, useState } from 'react'
import './App.css'
import heroImage from './assets/hero.png'
import {
  appendLayer,
  createDocument,
  createGroupLayer,
  createImageLayer,
  createShapeLayer,
  createTextLayer,
  findLayer,
  moveLayer,
  removeLayer,
  selectLayer,
  updateLayer,
} from './lib/layers'

const HANDLE_DIRECTIONS = [
  { key: 'nw', x: -1, y: -1 },
  { key: 'n', x: 0, y: -1 },
  { key: 'ne', x: 1, y: -1 },
  { key: 'e', x: 1, y: 0 },
  { key: 'se', x: 1, y: 1 },
  { key: 's', x: 0, y: 1 },
  { key: 'sw', x: -1, y: 1 },
  { key: 'w', x: -1, y: 0 },
]

const MIN_LAYER_WIDTH = 72
const MIN_LAYER_HEIGHT = 48

function getFrameDimensions(layer) {
  return {
    width: Math.max(MIN_LAYER_WIDTH, layer.width * Math.max(Math.abs(layer.scaleX), 0.1)),
    height: Math.max(MIN_LAYER_HEIGHT, layer.height * Math.max(Math.abs(layer.scaleY), 0.1)),
  }
}

function createInitialDocument() {
  const background = createImageLayer({
    name: 'Hero Image',
    x: 76,
    y: 62,
    width: 360,
    height: 260,
    src: heroImage,
  })
  const card = createShapeLayer({
    name: 'Color Block',
    x: 340,
    y: 120,
    width: 220,
    height: 220,
    fill: '#f97316',
    radius: 34,
  })
  const title = createTextLayer({
    name: 'Headline',
    x: 126,
    y: 114,
    width: 300,
    height: 120,
    text: 'A cleaner\nlayer stack',
    fontSize: 40,
  })
  const group = createGroupLayer({
    name: 'Empty Group',
    x: 460,
    y: 78,
    width: 180,
    height: 120,
  })

  return createDocument(
    [background, card, title, group],
    title.id,
  )
}

function loadImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }

    image.onerror = () => {
      reject(new Error('Image could not be loaded'))
    }

    image.src = src
  })
}

function getImportedImageFrame(width, height) {
  const maxWidth = 340
  const maxHeight = 260
  const scale = Math.min(maxWidth / width, maxHeight / height, 1)

  return {
    width: Math.max(MIN_LAYER_WIDTH, Math.round(width * scale)),
    height: Math.max(MIN_LAYER_HEIGHT, Math.round(height * scale)),
  }
}

function App() {
  const canvasRef = useRef(null)
  const imageInputRef = useRef(null)
  const interactionRef = useRef(null)
  const [documentState, setDocumentState] = useState(() => createInitialDocument())
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)

  const selectedLayer = findLayer(documentState, documentState.selectedLayerId)

  useEffect(() => {
    function handlePointerMove(event) {
      const interaction = interactionRef.current
      const canvas = canvasRef.current

      if (!interaction || !canvas) {
        return
      }

      const rect = canvas.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top

      if (interaction.type === 'move') {
        const nextX = pointerX - interaction.offsetX
        const nextY = pointerY - interaction.offsetY

        setDocumentState((currentDocument) =>
          updateLayer(currentDocument, interaction.layerId, {
            x: nextX,
            y: nextY,
          }),
        )
      }

      if (interaction.type === 'resize') {
        const deltaX = pointerX - interaction.pointerStart.x
        const deltaY = pointerY - interaction.pointerStart.y
        const startFrameWidth = interaction.frameWidth
        const startFrameHeight = interaction.frameHeight
        let nextFrameWidth = startFrameWidth
        let nextFrameHeight = startFrameHeight
        let nextX = interaction.startX
        let nextY = interaction.startY

        if (interaction.handle.x === 1) {
          nextFrameWidth = Math.max(MIN_LAYER_WIDTH, startFrameWidth + deltaX)
        }

        if (interaction.handle.x === -1) {
          nextFrameWidth = Math.max(MIN_LAYER_WIDTH, startFrameWidth - deltaX)
          nextX = interaction.startX + (startFrameWidth - nextFrameWidth)
        }

        if (interaction.handle.y === 1) {
          nextFrameHeight = Math.max(MIN_LAYER_HEIGHT, startFrameHeight + deltaY)
        }

        if (interaction.handle.y === -1) {
          nextFrameHeight = Math.max(MIN_LAYER_HEIGHT, startFrameHeight - deltaY)
          nextY = interaction.startY + (startFrameHeight - nextFrameHeight)
        }

        if (interaction.handle.x !== 0 && interaction.handle.y !== 0) {
          const widthRatio = nextFrameWidth / startFrameWidth
          const heightRatio = nextFrameHeight / startFrameHeight
          const dominantRatio =
            Math.abs(widthRatio - 1) > Math.abs(heightRatio - 1) ? widthRatio : heightRatio
          const minimumUniformRatio = Math.max(
            MIN_LAYER_WIDTH / startFrameWidth,
            MIN_LAYER_HEIGHT / startFrameHeight,
          )
          const uniformRatio = Math.max(dominantRatio, minimumUniformRatio)

          nextFrameWidth = startFrameWidth * uniformRatio
          nextFrameHeight = startFrameHeight * uniformRatio

          if (interaction.handle.x === -1) {
            nextX = interaction.startX + (startFrameWidth - nextFrameWidth)
          }

          if (interaction.handle.y === -1) {
            nextY = interaction.startY + (startFrameHeight - nextFrameHeight)
          }
        }

        setDocumentState((currentDocument) =>
          updateLayer(currentDocument, interaction.layerId, (layer) => ({
            ...layer,
            x: nextX,
            y: nextY,
            width: Math.max(
              MIN_LAYER_WIDTH,
              nextFrameWidth / Math.max(Math.abs(layer.scaleX), 0.1),
            ),
            height: Math.max(
              MIN_LAYER_HEIGHT,
              nextFrameHeight / Math.max(Math.abs(layer.scaleY), 0.1),
            ),
          })),
        )
      }
    }

    function handlePointerUp() {
      interactionRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  function addLayer(factory) {
    const nextLayer = factory()
    setDocumentState((currentDocument) => appendLayer(currentDocument, nextLayer))
  }

  async function handleImageImport(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const imageUrl = URL.createObjectURL(file)
    const resetInput = () => {
      event.target.value = ''
    }

    try {
      const { width, height } = await loadImageDimensions(imageUrl)
      const frame = getImportedImageFrame(width, height)

      addLayer(() =>
        createImageLayer({
          x: 180,
          y: 80,
          width: frame.width,
          height: frame.height,
          name: file.name.replace(/\.[^.]+$/, '') || 'Imported Image',
          src: imageUrl,
          fit: 'fill',
        }),
      )
    } catch {
      URL.revokeObjectURL(imageUrl)
    }

    resetInput()
  }

  function updateSelectedLayer(patch) {
    if (!documentState.selectedLayerId) {
      return
    }

    setDocumentState((currentDocument) =>
      updateLayer(currentDocument, currentDocument.selectedLayerId, patch),
    )
  }

  function startMove(event, layer) {
    event.stopPropagation()

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const { width, height } = getFrameDimensions(layer)

    setDocumentState((currentDocument) => selectLayer(currentDocument, layer.id))
    interactionRef.current = {
      type: 'move',
      layerId: layer.id,
      offsetX: event.clientX - rect.left - layer.x,
      offsetY: event.clientY - rect.top - layer.y,
      frameWidth: width,
      frameHeight: height,
    }
  }

  function startResize(event, layer, handle) {
    event.stopPropagation()
    event.preventDefault()

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const { width, height } = getFrameDimensions(layer)

    setDocumentState((currentDocument) => selectLayer(currentDocument, layer.id))
    interactionRef.current = {
      type: 'resize',
      layerId: layer.id,
      handle,
      pointerStart: {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      startX: layer.x,
      startY: layer.y,
      frameWidth: width,
      frameHeight: height,
    }
  }

  function handleCanvasPointerDown(event) {
    if (event.target === event.currentTarget) {
      setDocumentState((currentDocument) => selectLayer(currentDocument, null))
    }
  }

  function handleNumericChange(key, value, minimum = null) {
    if (!selectedLayer) {
      return
    }

    const numericValue = Number(value)

    if (!Number.isFinite(numericValue)) {
      return
    }

    updateSelectedLayer({
      [key]: minimum === null ? numericValue : Math.max(minimum, numericValue),
    })
  }

  function renderLayer(layer, index) {
    if (!layer.visible) {
      return null
    }

    const isSelected = layer.id === documentState.selectedLayerId

    return (
      <div
        key={layer.id}
        className={isSelected ? 'canvas-layer selected' : 'canvas-layer'}
        style={{
          left: `${layer.x}px`,
          top: `${layer.y}px`,
          width: `${layer.width}px`,
          height: `${layer.height}px`,
          transform: `rotate(${layer.rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`,
          opacity: layer.opacity,
          zIndex: index + 1,
        }}
        onPointerDown={(event) => startMove(event, layer)}
      >
        {layer.type === 'text' && (
          <div
            className="layer-body text-layer-body"
            style={{
              fontFamily: layer.fontFamily,
              fontSize: `${layer.fontSize}px`,
              color: layer.color,
            }}
          >
            {layer.text}
          </div>
        )}
        {layer.type === 'shape' && (
          <div
            className="layer-body shape-layer-body"
            style={{
              background: layer.fill,
              borderRadius: `${layer.radius}px`,
            }}
          />
        )}
        {layer.type === 'image' && (
          <div className="layer-body image-layer-body">
            {layer.src ? (
              <img
                className="layer-image"
                src={layer.src}
                alt={layer.name}
                style={{ objectFit: layer.fit }}
                draggable="false"
              />
            ) : (
              <div className="image-placeholder">Image</div>
            )}
          </div>
        )}
        {layer.type === 'group' && (
          <div className="layer-body group-layer-body">
            <span>Group</span>
            <small>{layer.childIds.length} child layers</small>
          </div>
        )}

        {isSelected && (
          <div className="selection-frame" aria-hidden="true">
            {HANDLE_DIRECTIONS.map((handle) => (
              <button
                key={handle.key}
                className={`resize-handle handle-${handle.key}`}
                type="button"
                onPointerDown={(event) => startResize(event, layer, handle)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="app-shell">
      <section className="editor-panel">
        <header className="editor-topbar">
          <div>
            <p className="eyebrow">Design Editor MVP</p>
            <h1>Layered document architecture</h1>
          </div>
          <div className="toolbar-actions">
            <button
              className="action-button"
              type="button"
              onClick={() =>
                addLayer(() =>
                  createTextLayer({
                    x: 120,
                    y: 100,
                    name: 'New Text',
                  }),
                )
              }
            >
              Add Text
            </button>
            <button
              className="action-button"
              type="button"
              onClick={() => imageInputRef.current?.click()}
            >
              Add Image
            </button>
            <button
              className="action-button"
              type="button"
              onClick={() =>
                addLayer(() =>
                  createGroupLayer({
                    x: 220,
                    y: 120,
                    name: 'New Group',
                  }),
                )
              }
            >
              Add Group
            </button>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="canvas-panel">
            <div
              ref={canvasRef}
              className="canvas-stage"
              onPointerDown={handleCanvasPointerDown}
              role="presentation"
            >
              <div className="canvas-surface">{documentState.layers.map(renderLayer)}</div>
            </div>
          </section>

          <aside className="sidebar">
            <input
              ref={imageInputRef}
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={handleImageImport}
            />
            <section className="panel-card">
              <div className="layer-list">
                {[...documentState.layers].reverse().map((layer) => {
                  const actualIndex = documentState.layers.findIndex(
                    (candidate) => candidate.id === layer.id,
                  )
                  const isTop = actualIndex === documentState.layers.length - 1
                  const isBottom = actualIndex === 0
                  const isSelected = layer.id === documentState.selectedLayerId

                  return (
                    <div
                      key={layer.id}
                      className={isSelected ? 'layer-row selected' : 'layer-row'}
                      onClick={() =>
                        setDocumentState((currentDocument) => selectLayer(currentDocument, layer.id))
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setDocumentState((currentDocument) =>
                            selectLayer(currentDocument, layer.id),
                          )
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
                          setDocumentState((currentDocument) =>
                            updateLayer(currentDocument, layer.id, {
                              visible: !layer.visible,
                            }),
                          )
                        }}
                      >
                        {layer.visible ? 'Hide' : 'Show'}
                      </button>

                      <div className="layer-meta">
                        <input
                          className="layer-name-input"
                          type="text"
                          value={layer.name}
                          onChange={(event) =>
                            setDocumentState((currentDocument) =>
                              updateLayer(currentDocument, layer.id, {
                                name: event.target.value,
                              }),
                            )
                          }
                          onClick={(event) => event.stopPropagation()}
                        />
                        <span className="layer-type-chip">{layer.type}</span>
                      </div>

                      <div className="row-actions">
                        <button
                          className="icon-button"
                          type="button"
                          disabled={isTop}
                          onClick={(event) => {
                            event.stopPropagation()
                            setDocumentState((currentDocument) =>
                              moveLayer(currentDocument, layer.id, 'up'),
                            )
                          }}
                        >
                          Up
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          disabled={isBottom}
                          onClick={(event) => {
                            event.stopPropagation()
                            setDocumentState((currentDocument) =>
                              moveLayer(currentDocument, layer.id, 'down'),
                            )
                          }}
                        >
                          Down
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setDocumentState((currentDocument) =>
                              removeLayer(currentDocument, layer.id),
                            )
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <button
              className="inspector-toggle"
              type="button"
              onClick={() => setIsInspectorOpen((currentValue) => !currentValue)}
            >
              {isInspectorOpen ? 'Hide Selected Layer' : 'Show Selected Layer'}
            </button>

            {isInspectorOpen && (
              <section className="panel-card">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Selected Layer</p>
                    <h2>{selectedLayer ? selectedLayer.name : 'Nothing selected'}</h2>
                  </div>
                  {selectedLayer && (
                    <button
                      className="delete-button"
                      type="button"
                      onClick={() =>
                        setDocumentState((currentDocument) =>
                          removeLayer(currentDocument, selectedLayer.id),
                        )
                      }
                    >
                      Delete
                    </button>
                  )}
                </div>

                {selectedLayer ? (
                  <div className="property-grid">
                    <label className="property-field">
                      <span>X</span>
                      <input
                        type="number"
                        value={selectedLayer.x}
                        onChange={(event) => handleNumericChange('x', event.target.value)}
                      />
                    </label>
                    <label className="property-field">
                      <span>Y</span>
                      <input
                        type="number"
                        value={selectedLayer.y}
                        onChange={(event) => handleNumericChange('y', event.target.value)}
                      />
                    </label>
                    <label className="property-field">
                      <span>Width</span>
                      <input
                        type="number"
                        min={MIN_LAYER_WIDTH}
                        value={selectedLayer.width}
                        onChange={(event) => handleNumericChange('width', event.target.value, MIN_LAYER_WIDTH)}
                      />
                    </label>
                    <label className="property-field">
                      <span>Height</span>
                      <input
                        type="number"
                        min={MIN_LAYER_HEIGHT}
                        value={selectedLayer.height}
                        onChange={(event) => handleNumericChange('height', event.target.value, MIN_LAYER_HEIGHT)}
                      />
                    </label>
                    <label className="property-field">
                      <span>Rotation</span>
                      <input
                        type="number"
                        value={selectedLayer.rotation}
                        onChange={(event) => handleNumericChange('rotation', event.target.value)}
                      />
                    </label>
                    <label className="property-field">
                      <span>Opacity</span>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        value={selectedLayer.opacity}
                        onChange={(event) => handleNumericChange('opacity', event.target.value, 0)}
                      />
                    </label>
                    <label className="property-field">
                      <span>Scale X</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={selectedLayer.scaleX}
                        onChange={(event) => handleNumericChange('scaleX', event.target.value, 0.1)}
                      />
                    </label>
                    <label className="property-field">
                      <span>Scale Y</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={selectedLayer.scaleY}
                        onChange={(event) => handleNumericChange('scaleY', event.target.value, 0.1)}
                      />
                    </label>

                    {selectedLayer.type === 'text' && (
                      <>
                        <label className="property-field full-width">
                          <span>Text</span>
                          <textarea
                            value={selectedLayer.text}
                            onChange={(event) => updateSelectedLayer({ text: event.target.value })}
                          />
                        </label>
                        <label className="property-field">
                          <span>Font Size</span>
                          <input
                            type="number"
                            min="8"
                            value={selectedLayer.fontSize}
                            onChange={(event) => handleNumericChange('fontSize', event.target.value, 8)}
                          />
                        </label>
                        <label className="property-field">
                          <span>Color</span>
                          <input
                            type="color"
                            value={selectedLayer.color}
                            onChange={(event) => updateSelectedLayer({ color: event.target.value })}
                          />
                        </label>
                      </>
                    )}

                    {selectedLayer.type === 'shape' && (
                      <>
                        <label className="property-field">
                          <span>Fill</span>
                          <input
                            type="color"
                            value={selectedLayer.fill}
                            onChange={(event) => updateSelectedLayer({ fill: event.target.value })}
                          />
                        </label>
                        <label className="property-field">
                          <span>Radius</span>
                          <input
                            type="number"
                            min="0"
                            value={selectedLayer.radius}
                            onChange={(event) => handleNumericChange('radius', event.target.value, 0)}
                          />
                        </label>
                      </>
                    )}

                    {selectedLayer.type === 'image' && (
                      <label className="property-field full-width">
                        <span>Image Source</span>
                        <input
                          type="text"
                          value={selectedLayer.src}
                          onChange={(event) => updateSelectedLayer({ src: event.target.value })}
                        />
                      </label>
                    )}

                    {selectedLayer.type === 'group' && (
                      <div className="group-note full-width">
                        Groups are modeled as layers already, but nested child management is intentionally left out of this MVP.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="empty-state">
                    Select a layer from the canvas or the stack to edit its properties.
                  </p>
                )}
              </section>
            )}
          </aside>
        </div>

        <div className="canvas-prompt-row">
          <div className="canvas-prompt-shell">
            <input
              className="canvas-prompt-input"
              type="text"
              placeholder="Describe what you want to create..."
            />
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
