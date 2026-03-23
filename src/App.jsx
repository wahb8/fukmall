import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import addImageIcon from './assets/add image.svg'
import addTextIcon from './assets/add text.svg'
import closeIcon from './assets/Close (X).svg'
import downIcon from './assets/down.svg'
import heroImage from './assets/hero.png'
import hiddenIcon from './assets/Hidden.svg'
import redoIcon from './assets/redo.svg'
import undoIcon from './assets/undo.svg'
import upIcon from './assets/up.svg'
import visibleIcon from './assets/Visible.svg'
import { useHistory } from './hooks/useHistory'
import { eraseDot, eraseStroke, paintMaskDot, paintMaskStroke } from './lib/eraserTool'
import {
  appendLayer,
  createDocument,
  createGroupLayer,
  createImageLayer,
  createRasterLayer,
  createShapeLayer,
  createTextLayer,
  isErasableLayer,
  findLayer,
  insertLayer,
  isRasterLayer,
  moveLayer,
  removeLayer,
  selectLayer,
  updateLayer,
} from './lib/layers'
import {
  applyEraseMask,
  canvasToBitmap,
  cloneCanvas,
  cropCanvasToBounds,
  createCanvasFromSource,
  createTransparentCanvas,
  createMaskCanvasFromSource,
  createEmptyMaskCanvas,
  getCanvasAlphaBounds,
  measureTextLayerBounds,
  paintCanvas,
  readFileAsDataUrl,
  renderTextLayerToCanvas,
  toLayerCoordinates,
} from './lib/raster'
import { drawDot, drawStroke } from './lib/penTool'

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
const DEFAULT_ERASER_SIZE = 28
const DEFAULT_PEN_SIZE = 16
const DEFAULT_PEN_COLOR = '#0f172a'
const DOCUMENT_WIDTH = 760
const DOCUMENT_HEIGHT = 570

function getTextLayerName(text) {
  const normalizedText = text.replace(/\s+/g, ' ').trim()
  return normalizedText || 'New Text'
}

function getFrameDimensions(layer) {
  return {
    width: Math.max(MIN_LAYER_WIDTH, layer.width * Math.max(Math.abs(layer.scaleX), 0.1)),
    height: Math.max(MIN_LAYER_HEIGHT, layer.height * Math.max(Math.abs(layer.scaleY), 0.1)),
  }
}

function getTextLayerSize(layer, text = layer.text, fontSize = layer.fontSize) {
  const bounds = measureTextLayerBounds({
    ...layer,
    text,
    fontSize,
  })

  return {
    width: Math.max(MIN_LAYER_WIDTH, bounds.width),
    height: Math.max(MIN_LAYER_HEIGHT, bounds.height),
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
    bitmap: heroImage,
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
    background.id,
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

function isEditableTarget(target) {
  return target instanceof HTMLElement && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
}

function createRasterSurfaceEntry() {
  return {
    offscreenCanvas: null,
    maskCanvas: null,
    visibleCanvas: null,
    layerElement: null,
    bitmapKey: null,
    syncToken: 0,
  }
}

function toDocumentCoordinates(pointerEvent, element) {
  if (!element) {
    return null
  }

  const rect = element.getBoundingClientRect()

  if (rect.width === 0 || rect.height === 0) {
    return null
  }

  const normalizedX = (pointerEvent.clientX - rect.left) / rect.width
  const normalizedY = (pointerEvent.clientY - rect.top) / rect.height

  return {
    x: Math.min(Math.max(normalizedX, 0), 1) * DOCUMENT_WIDTH,
    y: Math.min(Math.max(normalizedY, 0), 1) * DOCUMENT_HEIGHT,
  }
}

function getPointerSamples(pointerEvent) {
  if (typeof pointerEvent.getCoalescedEvents === 'function') {
    const samples = pointerEvent.getCoalescedEvents()

    if (samples.length > 0) {
      return samples
    }
  }

  return [pointerEvent]
}

function App() {
  const canvasRef = useRef(null)
  const canvasSurfaceRef = useRef(null)
  const imageInputRef = useRef(null)
  const interactionRef = useRef(null)
  const rasterSurfacesRef = useRef(new Map())
  const {
    present: documentState,
    commit,
    setTransient,
    commitTransientChange,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory(createInitialDocument())
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)
  const [editingTextLayerId, setEditingTextLayerId] = useState(null)
  const [textDraft, setTextDraft] = useState('')
  const [activeTool, setActiveTool] = useState('select')
  const [penDrawingLayerId, setPenDrawingLayerId] = useState(null)
  const [penColor, setPenColor] = useState(DEFAULT_PEN_COLOR)
  const [penSize, setPenSize] = useState(DEFAULT_PEN_SIZE)
  const [eraserSize, setEraserSize] = useState(DEFAULT_ERASER_SIZE)

  const selectedLayer = findLayer(documentState, documentState.selectedLayerId)
  const canEraseSelectedLayer = isErasableLayer(selectedLayer)
  const currentTool = (
    activeTool === 'pen'
      ? 'pen'
      : activeTool === 'eraser' && canEraseSelectedLayer
        ? 'eraser'
        : 'select'
  )

  const getRasterSurfaceEntry = useCallback((layerId) => {
    const existingEntry = rasterSurfacesRef.current.get(layerId)

    if (existingEntry) {
      return existingEntry
    }

    const nextEntry = createRasterSurfaceEntry()
    rasterSurfacesRef.current.set(layerId, nextEntry)
    return nextEntry
  }, [])

  const drawRasterLayer = useCallback((layerId) => {
    const entry = rasterSurfacesRef.current.get(layerId)

    if (!entry?.offscreenCanvas || !entry.visibleCanvas) {
      return
    }

    paintCanvas(entry.visibleCanvas, entry.offscreenCanvas)
  }, [])

  const getLayerSurfaceKey = useCallback((layer) => {
    if (isRasterLayer(layer)) {
      return JSON.stringify({
        type: layer.type,
        bitmap: layer.bitmap ?? '',
        width: layer.type === 'raster' ? layer.width : null,
        height: layer.type === 'raster' ? layer.height : null,
      })
    }

    if (layer.type === 'text') {
      return JSON.stringify({
        type: layer.type,
        width: layer.width,
        height: layer.height,
        text: layer.text,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        color: layer.color,
        eraseMask: layer.eraseMask ?? '',
      })
    }

    return `${layer.id}:${layer.type}`
  }, [])

  const ensureRasterLayerSurface = useCallback(async (layer) => {
    if (!isErasableLayer(layer)) {
      return null
    }

    const entry = getRasterSurfaceEntry(layer.id)
    const surfaceKey = getLayerSurfaceKey(layer)

    if (entry.offscreenCanvas && entry.bitmapKey === surfaceKey) {
      drawRasterLayer(layer.id)
      return entry.offscreenCanvas
    }

    const nextToken = entry.syncToken + 1
    entry.syncToken = nextToken

    let canvas = null
    let maskCanvas = null

    if (layer.type === 'image') {
      const imageSurface = await createCanvasFromSource(layer.bitmap)
      canvas = imageSurface.canvas
      maskCanvas = null
    }

    if (layer.type === 'raster') {
      if (layer.bitmap) {
        const rasterSurface = await createCanvasFromSource(layer.bitmap)
        canvas = rasterSurface.canvas
      } else {
        canvas = createTransparentCanvas(layer.width, layer.height)
      }
      maskCanvas = null
    }

    if (layer.type === 'text') {
      const baseCanvas = renderTextLayerToCanvas(layer)
      maskCanvas = await createMaskCanvasFromSource(
        layer.eraseMask ?? '',
        baseCanvas.width,
        baseCanvas.height,
      )
      canvas = applyEraseMask(baseCanvas, maskCanvas)
    }

    if (entry.syncToken !== nextToken) {
      return entry.offscreenCanvas
    }

    entry.offscreenCanvas = canvas
    entry.maskCanvas = maskCanvas
    entry.bitmapKey = surfaceKey
    drawRasterLayer(layer.id)

    return entry.offscreenCanvas
  }, [drawRasterLayer, getLayerSurfaceKey, getRasterSurfaceEntry])

  useEffect(() => {
    const currentLayerIds = new Set(documentState.layers.map((layer) => layer.id))

    for (const [layerId] of rasterSurfacesRef.current) {
      if (!currentLayerIds.has(layerId)) {
        rasterSurfacesRef.current.delete(layerId)
      }
    }

    for (const layer of documentState.layers) {
      if (isErasableLayer(layer)) {
        ensureRasterLayerSurface(layer).catch(() => {})
      }
    }
  }, [documentState.layers, ensureRasterLayerSurface])

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
        interactionRef.current = {
          ...interaction,
          hasChanged: true,
        }

        setTransient((currentDocument) =>
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

        interactionRef.current = {
          ...interaction,
          hasChanged: true,
        }

        setTransient((currentDocument) =>
          updateLayer(currentDocument, interaction.layerId, (layer) => {
            const nextWidth = Math.max(
              MIN_LAYER_WIDTH,
              nextFrameWidth / Math.max(Math.abs(layer.scaleX), 0.1),
            )
            const nextHeight = Math.max(
              MIN_LAYER_HEIGHT,
              nextFrameHeight / Math.max(Math.abs(layer.scaleY), 0.1),
            )

            if (interaction.layerType === 'text' && interaction.startFontSize) {
              const widthRatio = nextWidth / Math.max(interaction.startWidth, 1)
              const heightRatio = nextHeight / Math.max(interaction.startHeight, 1)
              const scaleRatio = interaction.handle.x !== 0 && interaction.handle.y !== 0
                ? Math.max(widthRatio, heightRatio)
                : interaction.handle.y !== 0
                  ? heightRatio
                  : widthRatio

              return {
                ...layer,
                x: nextX,
                y: nextY,
                width: nextWidth,
                height: nextHeight,
                fontSize: Math.max(8, Math.round(interaction.startFontSize * scaleRatio)),
              }
            }

            return {
              ...layer,
              x: nextX,
              y: nextY,
              width: nextWidth,
              height: nextHeight,
            }
          }),
        )
      }

      if (interaction.type === 'pen') {
        const surfaceEntry = rasterSurfacesRef.current.get(interaction.layerId)
        const pointerSamples = getPointerSamples(event)

        if (!surfaceEntry?.offscreenCanvas || pointerSamples.length === 0) {
          return
        }

        const context = surfaceEntry.offscreenCanvas.getContext('2d')

        if (!context) {
          return
        }

        let lastPoint = interaction.lastPoint

        for (const pointerSample of pointerSamples) {
          const layerPoint = toDocumentCoordinates(pointerSample, canvasSurfaceRef.current)

          if (!layerPoint) {
            continue
          }

          drawStroke(
            context,
            lastPoint.x,
            lastPoint.y,
            layerPoint.x,
            layerPoint.y,
            interaction.color,
            interaction.size,
          )
          lastPoint = layerPoint
        }

        drawRasterLayer(interaction.layerId)

        interactionRef.current = {
          ...interaction,
          lastPoint,
          hasChanged: true,
        }
      }

      if (interaction.type === 'erase') {
        const currentLayer = findLayer(documentState, interaction.layerId)
        const surfaceEntry = rasterSurfacesRef.current.get(interaction.layerId)
        const layerPoint = currentLayer && surfaceEntry?.offscreenCanvas
          ? toLayerCoordinates(event, surfaceEntry.layerElement, surfaceEntry.offscreenCanvas)
          : null

        if (!currentLayer || !surfaceEntry?.offscreenCanvas || !layerPoint) {
          return
        }

        const context = surfaceEntry.offscreenCanvas.getContext('2d')

        if (!context) {
          return
        }

        if (interaction.layerType === 'text') {
          const maskContext = surfaceEntry.maskCanvas?.getContext('2d')

          if (!maskContext) {
            return
          }

          maskContext.fillStyle = '#000000'
          maskContext.strokeStyle = '#000000'
          paintMaskStroke(
            maskContext,
            interaction.lastPoint.x,
            interaction.lastPoint.y,
            layerPoint.x,
            layerPoint.y,
            interaction.size,
          )

          const baseCanvas = renderTextLayerToCanvas(currentLayer)
          surfaceEntry.offscreenCanvas = applyEraseMask(baseCanvas, surfaceEntry.maskCanvas)
        } else {
          eraseStroke(
            context,
            interaction.lastPoint.x,
            interaction.lastPoint.y,
            layerPoint.x,
            layerPoint.y,
            interaction.size,
          )
        }

        drawRasterLayer(interaction.layerId)

        interactionRef.current = {
          ...interaction,
          lastPoint: layerPoint,
          hasChanged: true,
        }
      }
    }

    function handlePointerUp() {
      const interaction = interactionRef.current

      if (interaction?.type === 'pen') {
        if (interaction.hasChanged) {
          const surfaceEntry = rasterSurfacesRef.current.get(interaction.layerId)
          const currentLayer = findLayer(documentState, interaction.layerId)

          if (surfaceEntry?.offscreenCanvas && currentLayer) {
            let nextCanvas = surfaceEntry.offscreenCanvas
            let nextX = currentLayer.x
            let nextY = currentLayer.y
            let nextWidth = currentLayer.width
            let nextHeight = currentLayer.height

            if (currentLayer.type === 'raster') {
              const nextBounds = getCanvasAlphaBounds(surfaceEntry.offscreenCanvas)

              if (nextBounds) {
                nextCanvas = cropCanvasToBounds(surfaceEntry.offscreenCanvas, nextBounds)
                nextX = nextBounds.x
                nextY = nextBounds.y
                nextWidth = nextBounds.width
                nextHeight = nextBounds.height
                surfaceEntry.offscreenCanvas = nextCanvas
                surfaceEntry.bitmapKey = JSON.stringify({
                  type: currentLayer.type,
                  bitmap: canvasToBitmap(nextCanvas),
                  width: nextWidth,
                  height: nextHeight,
                })
              }
            }

            const nextBitmap = canvasToBitmap(nextCanvas)

            commit((currentDocument) =>
              updateLayer(currentDocument, interaction.layerId, {
                bitmap: nextBitmap,
                x: nextX,
                y: nextY,
                width: nextWidth,
                height: nextHeight,
              }),
            )
          }
        } else if (interaction.restoreCanvas) {
          const surfaceEntry = rasterSurfacesRef.current.get(interaction.layerId)

          if (surfaceEntry?.offscreenCanvas) {
            surfaceEntry.offscreenCanvas = interaction.restoreCanvas
            drawRasterLayer(interaction.layerId)
          }
        }

        setPenDrawingLayerId(null)
        interactionRef.current = null
        return
      }

      if (interaction?.type === 'erase') {
        if (interaction.hasChanged) {
          const surfaceEntry = rasterSurfacesRef.current.get(interaction.layerId)

          if (surfaceEntry?.offscreenCanvas) {
            if (interaction.layerType === 'text' && surfaceEntry.maskCanvas) {
              const nextEraseMask = canvasToBitmap(surfaceEntry.maskCanvas)

              commit((currentDocument) =>
                updateLayer(currentDocument, interaction.layerId, {
                  eraseMask: nextEraseMask,
                }),
              )
            } else {
              const nextBitmap = canvasToBitmap(surfaceEntry.offscreenCanvas)

              commit((currentDocument) =>
                updateLayer(currentDocument, interaction.layerId, {
                  bitmap: nextBitmap,
                }),
              )
            }
          }
        } else if (interaction.restoreCanvas) {
          const surfaceEntry = rasterSurfacesRef.current.get(interaction.layerId)

          if (surfaceEntry?.offscreenCanvas) {
            surfaceEntry.offscreenCanvas = interaction.restoreCanvas
            if (interaction.restoreMaskCanvas) {
              surfaceEntry.maskCanvas = interaction.restoreMaskCanvas
            }
            drawRasterLayer(interaction.layerId)
          }
        }

        interactionRef.current = null
        return
      }

      if (interaction?.originDocument && interaction.hasChanged) {
        commitTransientChange(interaction.originDocument)
      }

      interactionRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [commit, commitTransientChange, documentState, drawRasterLayer, setTransient])

  useEffect(() => {
    function handleKeyDown(event) {
      if (!(event.metaKey || event.ctrlKey) || isEditableTarget(event.target)) {
        return
      }

      const lowerKey = event.key.toLowerCase()

      if (lowerKey === 'z' && event.shiftKey) {
        event.preventDefault()
        redo()
        return
      }

      if (lowerKey === 'z') {
        event.preventDefault()
        undo()
        return
      }

      if (lowerKey === 'y' && event.ctrlKey) {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [redo, undo])

  function applyDocumentChange(updater) {
    commit((currentDocument) => updater(currentDocument))
  }

  function selectDocumentLayer(layerId) {
    setTransient((currentDocument) => selectLayer(currentDocument, layerId))
  }

  function addLayer(factory) {
    const nextLayer = factory()
    applyDocumentChange((currentDocument) => appendLayer(currentDocument, nextLayer))
  }

  function resolvePenLayer(targetLayer) {
    if (selectedLayer?.type === 'raster') {
      return selectedLayer
    }

    if (targetLayer?.type === 'raster') {
      return targetLayer
    }

    const nextLayer = createRasterLayer({
      name: 'Drawing Layer',
    })

    commit((currentDocument) => insertLayer(currentDocument, nextLayer, targetLayer?.id ?? null))
    return nextLayer
  }

  async function handleImageImport(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const resetInput = () => {
      event.target.value = ''
    }

    try {
      const imageDataUrl = await readFileAsDataUrl(file)
      const { width, height } = await loadImageDimensions(imageDataUrl)
      const frame = getImportedImageFrame(width, height)

      addLayer(() =>
        createImageLayer({
          x: 180,
          y: 80,
          width: frame.width,
          height: frame.height,
          name: file.name.replace(/\.[^.]+$/, '') || 'Imported Image',
          src: imageDataUrl,
          bitmap: imageDataUrl,
          fit: 'fill',
        }),
      )
    } catch {
      // Ignore failed imports for the MVP.
    }

    resetInput()
  }

  function updateSelectedLayer(patch) {
    if (!documentState.selectedLayerId) {
      return
    }

    applyDocumentChange((currentDocument) =>
      updateLayer(currentDocument, currentDocument.selectedLayerId, patch),
    )
  }

  function startMove(event, layer) {
    if (editingTextLayerId === layer.id) {
      return
    }

    event.stopPropagation()

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const { width, height } = getFrameDimensions(layer)

    selectDocumentLayer(layer.id)
    interactionRef.current = {
      type: 'move',
      layerId: layer.id,
      offsetX: event.clientX - rect.left - layer.x,
      offsetY: event.clientY - rect.top - layer.y,
      frameWidth: width,
      frameHeight: height,
      originDocument: documentState,
      hasChanged: false,
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

    selectDocumentLayer(layer.id)
    interactionRef.current = {
      type: 'resize',
      layerId: layer.id,
      layerType: layer.type,
      handle,
      pointerStart: {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      startX: layer.x,
      startY: layer.y,
      startWidth: layer.width,
      startHeight: layer.height,
      startFontSize: layer.type === 'text' ? layer.fontSize : null,
      frameWidth: width,
      frameHeight: height,
      originDocument: documentState,
      hasChanged: false,
    }
  }

  async function beginPenStroke(event, layer) {
    event.stopPropagation()
    event.preventDefault()

    const penLayer = resolvePenLayer(layer)
    selectDocumentLayer(penLayer.id)

    const surfaceCanvas = await ensureRasterLayerSurface(penLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(penLayer.id)
    const documentPoint = toDocumentCoordinates(event, canvasSurfaceRef.current)

    if (!surfaceCanvas || !surfaceEntry || !documentPoint) {
      return
    }

    const workingCanvas = createTransparentCanvas(DOCUMENT_WIDTH, DOCUMENT_HEIGHT)
    const workingContext = workingCanvas.getContext('2d')

    if (!workingContext) {
      return
    }

    workingContext.drawImage(
      surfaceCanvas,
      penLayer.x,
      penLayer.y,
      penLayer.width,
      penLayer.height,
    )

    const restoreCanvas = cloneCanvas(workingCanvas)

    drawDot(workingContext, documentPoint.x, documentPoint.y, penColor, penSize)
    surfaceEntry.offscreenCanvas = workingCanvas
    drawRasterLayer(penLayer.id)
    setPenDrawingLayerId(penLayer.id)

    interactionRef.current = {
      type: 'pen',
      layerId: penLayer.id,
      lastPoint: documentPoint,
      color: penColor,
      size: penSize,
      restoreCanvas,
      hasChanged: true,
    }
  }

  async function beginErase(event, layer) {
    event.stopPropagation()
    event.preventDefault()

    selectDocumentLayer(layer.id)

    if (!isErasableLayer(layer)) {
      return
    }

    const surfaceCanvas = await ensureRasterLayerSurface(layer)
    const surfaceEntry = rasterSurfacesRef.current.get(layer.id)
    const layerPoint = surfaceCanvas && surfaceEntry?.layerElement
      ? toLayerCoordinates(event, surfaceEntry.layerElement, surfaceCanvas)
      : null

    if (!surfaceCanvas || !surfaceEntry || !layerPoint) {
      return
    }

    const context = surfaceCanvas.getContext('2d')

    if (!context) {
      return
    }

    const restoreCanvas = cloneCanvas(surfaceCanvas)
    const restoreMaskCanvas = surfaceEntry.maskCanvas ? cloneCanvas(surfaceEntry.maskCanvas) : null

    if (layer.type === 'text') {
      if (!surfaceEntry.maskCanvas) {
        surfaceEntry.maskCanvas = createEmptyMaskCanvas(surfaceCanvas.width, surfaceCanvas.height)
      }

      const maskContext = surfaceEntry.maskCanvas.getContext('2d')

      if (!maskContext) {
        return
      }

      maskContext.fillStyle = '#000000'
      maskContext.strokeStyle = '#000000'
      paintMaskDot(maskContext, layerPoint.x, layerPoint.y, eraserSize)
      const baseCanvas = renderTextLayerToCanvas(layer)
      surfaceEntry.offscreenCanvas = applyEraseMask(baseCanvas, surfaceEntry.maskCanvas)
    } else {
      eraseDot(context, layerPoint.x, layerPoint.y, eraserSize)
    }

    drawRasterLayer(layer.id)

    interactionRef.current = {
      type: 'erase',
      layerId: layer.id,
      layerType: layer.type,
      lastPoint: layerPoint,
      size: eraserSize,
      restoreCanvas,
      restoreMaskCanvas,
      hasChanged: true,
    }
  }

  function handleLayerPointerDown(event, layer) {
    if (currentTool === 'pen') {
      beginPenStroke(event, layer)
      return
    }

    if (currentTool === 'eraser') {
      beginErase(event, layer)
      return
    }

    startMove(event, layer)
  }

  function handleCanvasPointerDown(event) {
    if (currentTool === 'pen') {
      beginPenStroke(event, selectedLayer)
      return
    }

    if (event.target === event.currentTarget) {
      selectDocumentLayer(null)
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

  function beginTextEditing(layer) {
    if (layer.type !== 'text') {
      return
    }

    selectDocumentLayer(layer.id)
    setEditingTextLayerId(layer.id)
    setTextDraft(layer.text)
    interactionRef.current = null
  }

  function updateTextLayerContent(layerId, nextText, applyTransient = false) {
    const targetLayer = findLayer(documentState, layerId)

    if (!targetLayer || targetLayer.type !== 'text') {
      return
    }

    const nextSize = getTextLayerSize(targetLayer, nextText)
    const nextPatch = {
      text: nextText,
      name: getTextLayerName(nextText),
      width: nextSize.width,
      height: nextSize.height,
    }

    if (applyTransient) {
      setTransient((currentDocument) => updateLayer(currentDocument, layerId, nextPatch))
      return
    }

    applyDocumentChange((currentDocument) => updateLayer(currentDocument, layerId, nextPatch))
  }

  function commitTextEditing(layerId) {
    const nextText = textDraft.trim() ? textDraft : 'New Text'

    updateTextLayerContent(layerId, nextText)
    setEditingTextLayerId(null)
    setTextDraft('')
  }

  function cancelTextEditing() {
    setEditingTextLayerId(null)
    setTextDraft('')
  }

  function registerLayerElement(layerId, node) {
    const entry = getRasterSurfaceEntry(layerId)
    entry.layerElement = node
  }

  function registerVisibleCanvas(layerId, node) {
    const entry = getRasterSurfaceEntry(layerId)
    entry.visibleCanvas = node
    drawRasterLayer(layerId)
  }

  function renderLayer(layer, index) {
    if (!layer.visible) {
      return null
    }

    const isSelected = layer.id === documentState.selectedLayerId
    const isEditingText = layer.type === 'text' && layer.id === editingTextLayerId
    const showEraserCursor = currentTool === 'eraser' && isErasableLayer(layer)
    const showPenCursor = currentTool === 'pen' && isRasterLayer(layer)
    const showPenSurface = showPenCursor && penDrawingLayerId === layer.id
    const layerLeft = showPenSurface ? 0 : layer.x
    const layerTop = showPenSurface ? 0 : layer.y
    const layerWidth = showPenSurface ? DOCUMENT_WIDTH : layer.width
    const layerHeight = showPenSurface ? DOCUMENT_HEIGHT : layer.height

    return (
      <div
        key={layer.id}
        ref={(node) => registerLayerElement(layer.id, node)}
        className={showPenCursor
          ? 'canvas-layer pen-enabled'
          : showEraserCursor
            ? 'canvas-layer eraser-enabled'
            : 'canvas-layer'}
        style={{
          left: `${layerLeft}px`,
          top: `${layerTop}px`,
          width: `${layerWidth}px`,
          height: `${layerHeight}px`,
          transform: `rotate(${layer.rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`,
          opacity: layer.opacity,
          zIndex: index + 1,
        }}
        onPointerDown={(event) => handleLayerPointerDown(event, layer)}
      >
        {layer.type === 'text' && (
          isEditingText ? (
            <textarea
              className="layer-body text-layer-body text-layer-editor"
              value={textDraft}
              style={{
                fontFamily: layer.fontFamily,
                fontSize: `${layer.fontSize}px`,
                color: layer.color,
              }}
              onChange={(event) => {
                setTextDraft(event.target.value)
                updateTextLayerContent(layer.id, event.target.value, true)
              }}
              onBlur={() => commitTextEditing(layer.id)}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelTextEditing()
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  commitTextEditing(layer.id)
                }
              }}
              autoFocus
            />
          ) : (
            <canvas
              ref={(node) => registerVisibleCanvas(layer.id, node)}
              className="layer-body text-layer-canvas"
              onDoubleClick={(event) => {
                event.stopPropagation()
                beginTextEditing(layer)
              }}
            />
          )
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
        {isRasterLayer(layer) && (
          <div className="layer-body image-layer-body">
            <canvas
              ref={(node) => registerVisibleCanvas(layer.id, node)}
              className="layer-image raster-layer-canvas"
            />
          </div>
        )}
        {layer.type === 'group' && (
          <div className="layer-body group-layer-body">
            <span>Group</span>
            <small>{layer.childIds.length} child layers</small>
          </div>
        )}

        {isSelected && currentTool !== 'pen' && (
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
            <h1>Fukmall</h1>
            <p className="title-subline">MVP</p>
          </div>
          <div className="toolbar-actions">
            <button
              className={currentTool === 'select' ? 'action-button active' : 'action-button'}
              type="button"
              onClick={() => setActiveTool('select')}
              aria-label="Select"
            >
              Select
            </button>
            <button
              className={currentTool === 'pen' ? 'action-button active' : 'action-button'}
              type="button"
              onClick={() => setActiveTool('pen')}
              aria-label="Pen"
            >
              Pen
            </button>
            <button
              className={currentTool === 'eraser' ? 'action-button active' : 'action-button'}
              type="button"
              disabled={!canEraseSelectedLayer}
              onClick={() => setActiveTool('eraser')}
              aria-label="Eraser"
            >
              Eraser
            </button>
            <label className="toolbar-range toolbar-color">
              <span>Pen</span>
              <input
                type="color"
                value={penColor}
                onChange={(event) => setPenColor(event.target.value)}
              />
            </label>
            <label className="toolbar-range">
              <span>Brush</span>
              <input
                type="range"
                min="2"
                max="64"
                step="1"
                value={penSize}
                onChange={(event) => setPenSize(Number(event.target.value))}
              />
              <strong>{penSize}</strong>
            </label>
            <label className="toolbar-range">
              <span>Eraser</span>
              <input
                type="range"
                min="8"
                max="96"
                step="1"
                value={eraserSize}
                onChange={(event) => setEraserSize(Number(event.target.value))}
              />
              <strong>{eraserSize}</strong>
            </label>
            <button
              className="action-button"
              type="button"
              disabled={!canUndo}
              onClick={undo}
              aria-label="Undo"
            >
              <img className="button-icon" src={undoIcon} alt="" aria-hidden="true" />
            </button>
            <button
              className="action-button"
              type="button"
              disabled={!canRedo}
              onClick={redo}
              aria-label="Redo"
            >
              <img className="button-icon" src={redoIcon} alt="" aria-hidden="true" />
            </button>
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
              aria-label="Add Text"
            >
              <img className="button-icon" src={addTextIcon} alt="" aria-hidden="true" />
            </button>
            <button
              className="action-button"
              type="button"
              onClick={() =>
                addLayer(() =>
                  createRasterLayer({
                    name: 'Drawing Layer',
                  }),
                )
              }
              aria-label="Add Drawing"
            >
              Layer
            </button>
            <button
              className="action-button"
              type="button"
              onClick={() => imageInputRef.current?.click()}
              aria-label="Add Image"
            >
              <img className="button-icon" src={addImageIcon} alt="" aria-hidden="true" />
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
          <div className="workspace-main-column">
            <section className="canvas-panel">
              <div
                ref={canvasRef}
                className="canvas-stage"
                onPointerDown={handleCanvasPointerDown}
                role="presentation"
              >
                <div ref={canvasSurfaceRef} className="canvas-surface">
                  {documentState.layers.map(renderLayer)}
                </div>
              </div>
            </section>

            <div className="canvas-prompt-shell">
              <input
                className="canvas-prompt-input"
                type="text"
                placeholder="Describe what you want to create..."
              />
            </div>
          </div>

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
                      onClick={() => selectDocumentLayer(layer.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectDocumentLayer(layer.id)
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
                        />
                        <span className="layer-type-chip">
                          {isRasterLayer(layer) ? 'raster' : layer.type}
                        </span>
                      </div>

                      <div className="row-actions">
                        <button
                          className="icon-button"
                          type="button"
                          disabled={isTop}
                          onClick={(event) => {
                            event.stopPropagation()
                            applyDocumentChange((currentDocument) =>
                              moveLayer(currentDocument, layer.id, 'up'),
                            )
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
                            applyDocumentChange((currentDocument) =>
                              moveLayer(currentDocument, layer.id, 'down'),
                            )
                          }}
                          aria-label="Move layer down"
                        >
                          <img className="button-icon" src={downIcon} alt="" aria-hidden="true" />
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            applyDocumentChange((currentDocument) =>
                              removeLayer(currentDocument, layer.id),
                            )
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
                        applyDocumentChange((currentDocument) =>
                          removeLayer(currentDocument, selectedLayer.id),
                        )
                      }
                      aria-label="Delete selected layer"
                    >
                      <img className="button-icon" src={closeIcon} alt="" aria-hidden="true" />
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
                        onChange={(event) =>
                          handleNumericChange('width', event.target.value, MIN_LAYER_WIDTH)
                        }
                      />
                    </label>
                    <label className="property-field">
                      <span>Height</span>
                      <input
                        type="number"
                        min={MIN_LAYER_HEIGHT}
                        value={selectedLayer.height}
                        onChange={(event) =>
                          handleNumericChange('height', event.target.value, MIN_LAYER_HEIGHT)
                        }
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
                            onChange={(event) =>
                              updateTextLayerContent(selectedLayer.id, event.target.value)
                            }
                          />
                        </label>
                        <label className="property-field">
                          <span>Font Size</span>
                          <input
                            type="number"
                            min="8"
                            value={selectedLayer.fontSize}
                            onChange={(event) => {
                              const nextFontSize = Math.max(8, Number(event.target.value))

                              if (!Number.isFinite(nextFontSize)) {
                                return
                              }

                              const nextSize = getTextLayerSize(
                                selectedLayer,
                                selectedLayer.text,
                                nextFontSize,
                              )

                              updateSelectedLayer({
                                fontSize: nextFontSize,
                                width: nextSize.width,
                                height: nextSize.height,
                              })
                            }}
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
                      <>
                        <label className="property-field full-width">
                          <span>Image Source</span>
                          <input
                            type="text"
                            value={selectedLayer.src}
                            onChange={(event) =>
                              updateSelectedLayer({
                                src: event.target.value,
                                bitmap: event.target.value,
                              })
                            }
                          />
                        </label>
                        <div className="group-note full-width">
                          Raster image layers can be erased directly. Using the pen creates a new
                          drawing layer above the current selection.
                        </div>
                      </>
                    )}

                    {selectedLayer.type === 'raster' && (
                      <div className="group-note full-width">
                        Drawing layers are editable with the pen and eraser tools. Each stroke is
                        committed as a single bitmap history step.
                      </div>
                    )}

                    {selectedLayer.type === 'group' && (
                      <div className="group-note full-width">
                        Groups are modeled as layers already, but nested child management is
                        intentionally left out of this MVP.
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
      </section>
    </main>
  )
}

export default App
