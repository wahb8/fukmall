import { useEffect, useRef, useState } from 'react'
import './App.css'

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

const DEFAULT_TEXT_WIDTH = 64
const DEFAULT_TEXT_HEIGHT = 32
const DEFAULT_FONT_SIZE = 32
const MIN_TEXT_WIDTH = 24
const MIN_TEXT_HEIGHT = 24
const MIN_FONT_SIZE = 12
const RESIZE_DAMPING = 0.35

function App() {
  const canvasRef = useRef(null)
  const editorRef = useRef(null)
  const interactionRef = useRef(null)
  const blockCanvasClickRef = useRef(false)
  const layerRef = useRef(0)
  const measureRef = useRef(null)
  const [tool, setTool] = useState('text')
  const [placedTexts, setPlacedTexts] = useState([])
  const [editingTextId, setEditingTextId] = useState(null)
  const [selectedTextId, setSelectedTextId] = useState(null)

  useEffect(() => {
    if (editingTextId !== null) {
      editorRef.current?.focus()
    }
  }, [editingTextId])

  useEffect(() => {
    function handlePointerMove(event) {
      const interaction = interactionRef.current
      const canvas = canvasRef.current

      if (!interaction || !canvas || editingTextId !== null || tool !== 'pointer') {
        return
      }

      const rect = canvas.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top

      interactionRef.current = {
        ...interaction,
        moved: true,
      }

      if (interaction.type === 'move') {
        const nextX = Math.min(
          Math.max(pointerX - interaction.offsetX, 0),
          rect.width - interaction.start.width,
        )
        const nextY = Math.min(
          Math.max(pointerY - interaction.offsetY, 0),
          rect.height - interaction.start.height,
        )

        updateText(interaction.id, {
          x: nextX,
          y: nextY,
        })
      }

      if (interaction.type === 'resize') {
        const deltaX = pointerX - interaction.pointerStart.x
        const deltaY = pointerY - interaction.pointerStart.y
        const next = {
          x: interaction.start.x,
          y: interaction.start.y,
          width: interaction.start.width,
          height: interaction.start.height,
          fontSize: interaction.start.fontSize,
        }

        if (interaction.handle.x === 1) {
          next.width = Math.max(MIN_TEXT_WIDTH, interaction.start.width + deltaX)
        }

        if (interaction.handle.x === -1) {
          const rawWidth = interaction.start.width - deltaX
          next.width = Math.max(MIN_TEXT_WIDTH, rawWidth)
          next.x = interaction.start.x + (interaction.start.width - next.width)
        }

        if (interaction.handle.y === 1) {
          next.height = Math.max(MIN_TEXT_HEIGHT, interaction.start.height + deltaY)
        }

        if (interaction.handle.y === -1) {
          const rawHeight = interaction.start.height - deltaY
          next.height = Math.max(MIN_TEXT_HEIGHT, rawHeight)
          next.y = interaction.start.y + (interaction.start.height - next.height)
        }

        const scaleX = next.width / interaction.start.width
        const scaleY = next.height / interaction.start.height
        const dampedScaleX = dampScale(scaleX)
        const dampedScaleY = dampScale(scaleY)
        let scale = 1

        if (interaction.handle.x !== 0 && interaction.handle.y === 0) {
          scale = dampedScaleX
        }

        if (interaction.handle.x === 0 && interaction.handle.y !== 0) {
          scale = dampedScaleY
        }

        if (interaction.handle.x !== 0 && interaction.handle.y !== 0) {
          scale = (dampedScaleX + dampedScaleY) / 2
        }

        next.fontSize = Math.max(
          MIN_FONT_SIZE,
          Math.round(interaction.start.fontSize * scale),
        )

        const measured = measureTextBox(interaction.start.text, next.fontSize)
        next.width = Math.max(next.width, measured.width)
        next.height = Math.max(next.height, measured.height)
        next.x = Math.min(Math.max(next.x, 0), rect.width - next.width)
        next.y = Math.min(Math.max(next.y, 0), rect.height - next.height)

        updateText(interaction.id, next)
      }
    }

    function handlePointerUp() {
      const interaction = interactionRef.current

      if (!interaction) {
        return
      }

      if (interaction.type === 'move' && !interaction.moved && tool === 'pointer') {
        setSelectedTextId(interaction.id)
      }

      interactionRef.current = {
        ...interaction,
        suppressCanvasClick: interaction.moved,
      }

      window.setTimeout(() => {
        interactionRef.current = null
      }, 0)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [editingTextId, tool])

  function dampScale(scale) {
    return 1 + (scale - 1) * RESIZE_DAMPING
  }

  function measureTextBox(text, fontSize) {
    const node = measureRef.current

    if (!node) {
      return { width: DEFAULT_TEXT_WIDTH, height: DEFAULT_TEXT_HEIGHT }
    }

    node.style.fontSize = `${fontSize}px`
    node.textContent = text || 'Text'

    return {
      width: Math.max(MIN_TEXT_WIDTH, Math.ceil(node.scrollWidth)),
      height: Math.max(MIN_TEXT_HEIGHT, Math.ceil(node.scrollHeight)),
    }
  }

  function updateText(id, patch) {
    setPlacedTexts((currentTexts) =>
      currentTexts.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  function syncTextBounds(id, nextText, nextFontSize) {
    const measured = measureTextBox(nextText, nextFontSize)
    updateText(id, measured)
  }

  function bringLayerToFront(id) {
    const nextLayer = layerRef.current + 1
    layerRef.current = nextLayer
    updateText(id, { layer: nextLayer })
    return nextLayer
  }

  function handleCanvasClick(event) {
    if (blockCanvasClickRef.current) {
      blockCanvasClickRef.current = false
      return
    }

    if (tool !== 'text') {
      return
    }

    if (interactionRef.current?.suppressCanvasClick) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(
      Math.max(event.clientX - rect.left, 0),
      rect.width - DEFAULT_TEXT_WIDTH,
    )
    const y = Math.min(
      Math.max(event.clientY - rect.top, 0),
      rect.height - DEFAULT_TEXT_HEIGHT,
    )
    const nextLayer = layerRef.current + 1
    const nextId = crypto.randomUUID()

    layerRef.current = nextLayer
    setSelectedTextId(nextId)
    setEditingTextId(nextId)
    setPlacedTexts((currentTexts) => [
      ...currentTexts,
      {
        id: nextId,
        text: '',
        x,
        y,
        width: DEFAULT_TEXT_WIDTH,
        height: DEFAULT_TEXT_HEIGHT,
        fontSize: DEFAULT_FONT_SIZE,
        layer: nextLayer,
      },
    ])
  }

  function handleCanvasPointerDown() {
    if (editingTextId === null) {
      setSelectedTextId(null)
    }
  }

  function startMove(event, item) {
    event.stopPropagation()
    blockCanvasClickRef.current = true

    if (tool !== 'pointer' || editingTextId === item.id) {
      return
    }

    bringLayerToFront(item.id)
    setSelectedTextId(item.id)

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()

    interactionRef.current = {
      type: 'move',
      id: item.id,
      offsetX: event.clientX - rect.left - item.x,
      offsetY: event.clientY - rect.top - item.y,
      start: item,
      moved: false,
      suppressCanvasClick: false,
    }
  }

  function startResize(event, item, handle) {
    event.stopPropagation()
    event.preventDefault()
    blockCanvasClickRef.current = true

    if (tool !== 'pointer') {
      return
    }

    bringLayerToFront(item.id)
    setSelectedTextId(item.id)
    setEditingTextId(null)

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()

    interactionRef.current = {
      type: 'resize',
      id: item.id,
      handle,
      pointerStart: {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      start: item,
      moved: false,
      suppressCanvasClick: false,
    }
  }

  function handleTextChange(id, value) {
    setPlacedTexts((currentTexts) =>
      currentTexts.map((item) => {
        if (item.id !== id) {
          return item
        }

        const measured = measureTextBox(value, item.fontSize)

        return {
          ...item,
          text: value,
          width: measured.width,
          height: measured.height,
        }
      }),
    )
  }

  function finishEditing(id) {
    const currentItem = placedTexts.find((item) => item.id === id)

    if (!currentItem) {
      setEditingTextId(null)
      return
    }

    if (!currentItem.text.trim()) {
      setPlacedTexts((currentTexts) => currentTexts.filter((item) => item.id !== id))
      if (selectedTextId === id) {
        setSelectedTextId(null)
      }
    } else {
      syncTextBounds(id, currentItem.text, currentItem.fontSize)
    }

    setEditingTextId(null)
  }

  function handleEditorKeyDown(event, id) {
    if (event.key === 'Escape') {
      event.preventDefault()
      finishEditing(id)
    }
  }

  function handleEditorPointerDown(event, id) {
    event.stopPropagation()
    blockCanvasClickRef.current = true
    bringLayerToFront(id)
    setSelectedTextId(id)
  }

  function handleTextClick(event, item) {
    event.stopPropagation()
    blockCanvasClickRef.current = true

    if (tool === 'text') {
      bringLayerToFront(item.id)
      setSelectedTextId(item.id)
      setEditingTextId(item.id)
      return
    }

    if (tool === 'pointer') {
      bringLayerToFront(item.id)
      setSelectedTextId(item.id)
    }
  }

  function handleResetCanvas() {
    interactionRef.current = null
    layerRef.current = 0
    setEditingTextId(null)
    setSelectedTextId(null)
    setPlacedTexts([])
  }

  return (
    <main className="app">
      <section className="editor-shell">
        <header className="toolbar">
          <button
            className={tool === 'pointer' ? 'tool-button active' : 'tool-button'}
            type="button"
            onClick={() => {
              setTool('pointer')
              setEditingTextId(null)
            }}
          >
            Pointer
          </button>
          <button
            className={tool === 'text' ? 'tool-button active' : 'tool-button'}
            type="button"
            onClick={() => setTool('text')}
          >
            Text Tool
          </button>
          <button className="tool-button" type="button" onClick={handleResetCanvas}>
            Rest
          </button>
          <p className="toolbar-note">
            `Text Tool` creates and edits text. `Pointer` selects, moves, and scales text layers.
          </p>
        </header>

        <div className="workspace">
          <div
            ref={canvasRef}
            className={tool === 'pointer' ? 'canvas pointer-mode' : 'canvas'}
            onClick={handleCanvasClick}
            onPointerDown={handleCanvasPointerDown}
            role="presentation"
          >
            {placedTexts.map((item) => {
              const isEditing = item.id === editingTextId
              const isSelected = item.id === selectedTextId

              return (
                <div
                  key={item.id}
                  className={isSelected ? 'text-layer selected' : 'text-layer'}
                  style={{
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    width: `${item.width}px`,
                    height: `${item.height}px`,
                    zIndex: item.layer,
                  }}
                >
                  {isEditing ? (
                    <textarea
                      ref={editorRef}
                      className="text-editor"
                      style={{
                        fontSize: `${item.fontSize}px`,
                      }}
                      value={item.text}
                      onChange={(event) => handleTextChange(item.id, event.target.value)}
                      onBlur={() => finishEditing(item.id)}
                      onKeyDown={(event) => handleEditorKeyDown(event, item.id)}
                      onPointerDown={(event) => handleEditorPointerDown(event, item.id)}
                    />
                  ) : (
                    <div
                      className={tool === 'pointer' ? 'placed-text pointer-active' : 'placed-text'}
                      style={{
                        fontSize: `${item.fontSize}px`,
                      }}
                      onClick={(event) => handleTextClick(event, item)}
                      onPointerDown={(event) => startMove(event, item)}
                    >
                      {item.text || 'Text'}
                    </div>
                  )}

                  {isSelected && !isEditing && tool === 'pointer' && (
                    <div className="selection-frame" aria-hidden="true">
                      {HANDLE_DIRECTIONS.map((handle) => (
                        <button
                          key={handle.key}
                          className={`resize-handle handle-${handle.key}`}
                          type="button"
                          onPointerDown={(event) => startResize(event, item, handle)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={measureRef} className="text-measurer" aria-hidden="true" />
          </div>
        </div>

        <input
          className="prompt-input"
          type="text"
          placeholder="enter prompt"
          readOnly
        />
      </section>
    </main>
  )
}

export default App
