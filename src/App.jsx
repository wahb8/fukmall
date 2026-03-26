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
  appendLassoPoint,
  clearSelectionFromCanvas,
  createFloatingSelection as buildFloatingSelection,
  finalizeLassoSelection,
  isPointInsideFloatingSelection,
  isPointInsidePolygon,
  renderFloatingSelection,
  renderLassoSelection,
} from './lib/lassoTool'
import {
  appendLayer,
  canLayerLockTransparentPixels,
  cloneLayer,
  createDocument,
  createGroupLayer,
  createImageLayer,
  createRasterLayer,
  createShapeLayer,
  createTextLayer,
  duplicateLayer,
  findLayer,
  isAlphaLocked,
  isErasableLayer,
  insertLayer,
  isRasterLayer,
  moveLayer,
  moveLayerToIndex,
  removeLayer,
  selectLayer,
  setLayerAlphaLock,
  updateLayer,
} from './lib/layers'
import {
  applyEraseMask,
  canvasToBitmap,
  cloneCanvas,
  composeTextLayerCanvases,
  createMaskedCanvas,
  cropCanvasToBounds,
  createCanvasFromSource,
  createTransparentCanvas,
  createMaskCanvasFromSource,
  createEmptyMaskCanvas,
  getCanvasAlphaBounds,
  paintCanvas,
  readFileAsDataUrl,
  renderTextLayerToCanvas,
  toLayerCoordinates,
} from './lib/raster'
import { screenToWorld, zoomAtPoint } from './lib/viewport'
import {
  appendStrokePoint,
  drawDot,
  drawSmoothStroke,
  getStrokeDragThreshold,
  getStrokeMinimumDistance,
  getSmoothedStrokePoints,
  hasStrokeMovedBeyondThreshold,
} from './lib/penTool'
import { FONT_FAMILY_OPTIONS } from './lib/fontOptions'
import {
  resizeBoxText,
  resizePointTextTransform,
  updateTextContent,
  updateTextLayerFont,
  updateTextStyle,
} from './lib/textLayer'
import {
  applyMoveSnapping,
  createEmptySnapGuides,
  DEFAULT_SNAP_THRESHOLD,
} from './lib/moveSnapping'

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
const MIN_VIEWPORT_ZOOM = 0.1
const MAX_VIEWPORT_ZOOM = 8
const VIEWPORT_ZOOM_STEP = 1.25

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
    paintOverlayCanvas: null,
    visibleCanvas: null,
    layerElement: null,
    bitmapKey: null,
    syncToken: 0,
  }
}

function getPointerPositionWithinElement(pointerEvent, element) {
  if (!element) {
    return null
  }

  const rect = element.getBoundingClientRect()

  if (rect.width === 0 || rect.height === 0) {
    return null
  }

  return {
    x: pointerEvent.clientX - rect.left,
    y: pointerEvent.clientY - rect.top,
  }
}

function toDocumentCoordinates(pointerEvent, element, viewport) {
  const pointerPosition = getPointerPositionWithinElement(pointerEvent, element)

  if (!pointerPosition) {
    return null
  }

  return {
    ...screenToWorld(pointerPosition.x, pointerPosition.y, viewport),
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

function canPaintWithPenOnLayer(layer) {
  return isRasterLayer(layer) || layer?.type === 'text'
}

function App() {
  const canvasRef = useRef(null)
  const canvasSurfaceRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const imageInputRef = useRef(null)
  const interactionRef = useRef(null)
  const rasterSurfacesRef = useRef(new Map())
  const dragPreviewImageRef = useRef(null)
  const copiedLayerRef = useRef(null)
  const lastPenEditableLayerIdRef = useRef(null)
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
  const [lassoSelection, setLassoSelection] = useState(null)
  const [floatingSelection, setFloatingSelection] = useState(null)
  const [draggedLayerId, setDraggedLayerId] = useState(null)
  const [layerDropTarget, setLayerDropTarget] = useState(null)
  const [isSnapEnabled, setIsSnapEnabled] = useState(true)
  const [activeMoveGuides, setActiveMoveGuides] = useState(() => createEmptySnapGuides())
  const [viewport, setViewport] = useState({
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  })

  const selectedLayer = findLayer(documentState, documentState.selectedLayerId)
  const currentTool = activeTool
  const activeBrushTool = currentTool === 'eraser' ? 'eraser' : 'pen'
  const hasActiveLassoSelection = Boolean(lassoSelection?.isClosed)
  const hasFloatingSelection = Boolean(floatingSelection)
  const zoomLabel = `${Math.round(viewport.zoom * 100)}%`

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
        fontWeight: layer.fontWeight,
        fontStyle: layer.fontStyle,
        color: layer.color,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing,
        textAlign: layer.textAlign,
        mode: layer.mode,
        boxWidth: layer.boxWidth,
        boxHeight: layer.boxHeight,
        eraseMask: layer.eraseMask ?? '',
        paintOverlayBitmap: layer.paintOverlayBitmap ?? '',
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
    let paintOverlayCanvas = null

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
      maskCanvas = await createMaskCanvasFromSource(
        layer.eraseMask ?? '',
        layer.width,
        layer.height,
      )
      paintOverlayCanvas = await createMaskCanvasFromSource(
        layer.paintOverlayBitmap ?? '',
        layer.width,
        layer.height,
      )
      const composedText = composeTextLayerCanvases(layer, maskCanvas, paintOverlayCanvas)
      canvas = composedText.composedCanvas
    }

    if (entry.syncToken !== nextToken) {
      return entry.offscreenCanvas
    }

    entry.offscreenCanvas = canvas
    entry.maskCanvas = maskCanvas
    entry.paintOverlayCanvas = paintOverlayCanvas
    entry.bitmapKey = surfaceKey
    drawRasterLayer(layer.id)

    return entry.offscreenCanvas
  }, [drawRasterLayer, getLayerSurfaceKey, getRasterSurfaceEntry])

  useEffect(() => {
    const dragPreviewImage = new Image()
    dragPreviewImage.src = addImageIcon
    dragPreviewImageRef.current = dragPreviewImage

    return () => {
      dragPreviewImageRef.current = null
    }
  }, [])

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
    if (lassoSelection && !findLayer(documentState, lassoSelection.sourceLayerId)) {
      setLassoSelection(null)
    }

    if (floatingSelection && !findLayer(documentState, floatingSelection.sourceLayerId)) {
      setFloatingSelection(null)
    }

    if (lastPenEditableLayerIdRef.current) {
      const lastPenEditableLayer = findLayer(documentState, lastPenEditableLayerIdRef.current)

      if (!lastPenEditableLayer || !canPaintWithPenOnLayer(lastPenEditableLayer)) {
        lastPenEditableLayerIdRef.current = null
      }
    }
  }, [documentState, floatingSelection, lassoSelection])

  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current

    if (!overlayCanvas) {
      return
    }

    overlayCanvas.width = DOCUMENT_WIDTH
    overlayCanvas.height = DOCUMENT_HEIGHT

    const context = overlayCanvas.getContext('2d')

    if (!context) {
      return
    }

    context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

    if (lassoSelection) {
      const sourceLayer = findLayer(documentState, lassoSelection.sourceLayerId)
      const sourceSurface = sourceLayer
        ? rasterSurfacesRef.current.get(sourceLayer.id)?.offscreenCanvas
        : null

      if (sourceLayer && sourceSurface) {
        renderLassoSelection(context, lassoSelection, sourceLayer, sourceSurface)
      }
    }

    if (floatingSelection) {
      renderFloatingSelection(context, floatingSelection)
    }

    if (activeMoveGuides.showVerticalCenter) {
      context.save()
      context.strokeStyle = '#0f766e'
      context.lineWidth = 1.5
      context.setLineDash([10, 6])
      context.beginPath()
      context.moveTo(DOCUMENT_WIDTH / 2, 0)
      context.lineTo(DOCUMENT_WIDTH / 2, DOCUMENT_HEIGHT)
      context.stroke()
      context.restore()
    }

    if (activeMoveGuides.showLeftEdge) {
      context.save()
      context.strokeStyle = '#0f766e'
      context.lineWidth = 1.5
      context.setLineDash([10, 6])
      context.beginPath()
      context.moveTo(0, 0)
      context.lineTo(0, DOCUMENT_HEIGHT)
      context.stroke()
      context.restore()
    }

    if (activeMoveGuides.showRightEdge) {
      context.save()
      context.strokeStyle = '#0f766e'
      context.lineWidth = 1.5
      context.setLineDash([10, 6])
      context.beginPath()
      context.moveTo(DOCUMENT_WIDTH, 0)
      context.lineTo(DOCUMENT_WIDTH, DOCUMENT_HEIGHT)
      context.stroke()
      context.restore()
    }

    if (activeMoveGuides.showHorizontalCenter) {
      context.save()
      context.strokeStyle = '#0f766e'
      context.lineWidth = 1.5
      context.setLineDash([10, 6])
      context.beginPath()
      context.moveTo(0, DOCUMENT_HEIGHT / 2)
      context.lineTo(DOCUMENT_WIDTH, DOCUMENT_HEIGHT / 2)
      context.stroke()
      context.restore()
    }

    if (activeMoveGuides.showTopEdge) {
      context.save()
      context.strokeStyle = '#0f766e'
      context.lineWidth = 1.5
      context.setLineDash([10, 6])
      context.beginPath()
      context.moveTo(0, 0)
      context.lineTo(DOCUMENT_WIDTH, 0)
      context.stroke()
      context.restore()
    }

    if (activeMoveGuides.showBottomEdge) {
      context.save()
      context.strokeStyle = '#0f766e'
      context.lineWidth = 1.5
      context.setLineDash([10, 6])
      context.beginPath()
      context.moveTo(0, DOCUMENT_HEIGHT)
      context.lineTo(DOCUMENT_WIDTH, DOCUMENT_HEIGHT)
      context.stroke()
      context.restore()
    }
  }, [activeMoveGuides, documentState, floatingSelection, lassoSelection])

  useEffect(() => {
    function handlePointerMove(event) {
      const interaction = interactionRef.current
      const canvas = canvasRef.current

      if (!interaction || !canvas) {
        return
      }

      const documentPoint = toDocumentCoordinates(event, canvas, viewport)

      if (!documentPoint) {
        return
      }

      if (interaction.type === 'move') {
        const nextX = documentPoint.x - interaction.offsetX
        const nextY = documentPoint.y - interaction.offsetY
        const snapResult = applyMoveSnapping(
          nextX,
          nextY,
          interaction.frameWidth,
          interaction.frameHeight,
          DOCUMENT_WIDTH,
          DOCUMENT_HEIGHT,
          {
            enabled: isSnapEnabled,
            threshold: DEFAULT_SNAP_THRESHOLD,
          },
        )
        interactionRef.current = {
          ...interaction,
          hasChanged: true,
        }
        setActiveMoveGuides(snapResult.guides)

        setTransient((currentDocument) =>
          updateLayer(currentDocument, interaction.layerId, {
            x: snapResult.x,
            y: snapResult.y,
          }),
        )
      }

      if (interaction.type === 'resize') {
        const deltaX = documentPoint.x - interaction.pointerStart.x
        const deltaY = documentPoint.y - interaction.pointerStart.y
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

        if (interaction.handle.x !== 0 && interaction.handle.y !== 0 && event.shiftKey) {
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
            if (interaction.layerType === 'text') {
              if (layer.mode === 'box') {
                const nextWidth = Math.max(
                  MIN_LAYER_WIDTH,
                  nextFrameWidth / Math.max(Math.abs(layer.scaleX), 0.1),
                )
                const nextHeight = Math.max(
                  MIN_LAYER_HEIGHT,
                  nextFrameHeight / Math.max(Math.abs(layer.scaleY), 0.1),
                )

                return resizeBoxText(
                  {
                    ...layer,
                    x: nextX,
                    y: nextY,
                  },
                  nextWidth,
                  nextHeight,
                )
              }

              const nextScaleX = Math.max(
                0.1,
                nextFrameWidth / Math.max(interaction.startWidth, 1),
              )
              const nextScaleY = Math.max(
                0.1,
                nextFrameHeight / Math.max(interaction.startHeight, 1),
              )

              return {
                ...resizePointTextTransform(
                  {
                    ...layer,
                    x: nextX,
                    y: nextY,
                  },
                  nextScaleX,
                  nextScaleY,
                ),
                width: layer.measuredWidth ?? layer.width,
                height: layer.measuredHeight ?? layer.height,
              }
            }

            const nextWidth = Math.max(
              MIN_LAYER_WIDTH,
              nextFrameWidth / Math.max(Math.abs(layer.scaleX), 0.1),
            )
            const nextHeight = Math.max(
              MIN_LAYER_HEIGHT,
              nextFrameHeight / Math.max(Math.abs(layer.scaleY), 0.1),
            )

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
        const currentLayer = findLayer(documentState, interaction.layerId)
        const surfaceEntry = rasterSurfacesRef.current.get(interaction.layerId)
        const pointerSamples = getPointerSamples(event)

        if (
          !currentLayer ||
          !surfaceEntry?.offscreenCanvas ||
          !interaction.restoreCanvas ||
          pointerSamples.length === 0
        ) {
          return
        }

        let nextPoints = interaction.points

        for (const pointerSample of pointerSamples) {
          const layerPoint = interaction.coordinateSpace === 'layer'
            ? toLayerCoordinates(pointerSample, surfaceEntry.layerElement, interaction.restoreCanvas)
            : toDocumentCoordinates(pointerSample, canvas, viewport)

          if (!layerPoint) {
            continue
          }

          nextPoints = appendStrokePoint(nextPoints, layerPoint, interaction.minimumDistance)
        }

        const hasDragged = interaction.hasDragged || hasStrokeMovedBeyondThreshold(
          nextPoints,
          interaction.dragThreshold,
        )
        const renderPoints = hasDragged
          ? getSmoothedStrokePoints(nextPoints, interaction.size)
          : nextPoints

        if (nextPoints === interaction.points && hasDragged === interaction.hasDragged) {
          return
        }

        const workingCanvas = cloneCanvas(interaction.restoreCanvas)

        if (hasDragged) {
          if (currentLayer.type === 'text') {
            const strokeCanvas = createTransparentCanvas(workingCanvas.width, workingCanvas.height)
            const strokeContext = strokeCanvas.getContext('2d')

            if (!strokeContext) {
              return
            }

            drawSmoothStroke(
              strokeContext,
              renderPoints,
              interaction.color,
              interaction.size,
            )

            const maskedStrokeCanvas = isAlphaLocked(currentLayer)
              ? createMaskedCanvas(
                strokeCanvas,
                composeTextLayerCanvases(currentLayer, surfaceEntry.maskCanvas).visibleTextCanvas,
              )
              : strokeCanvas

            const overlayContext = workingCanvas.getContext('2d')

            if (!overlayContext) {
              return
            }

            overlayContext.drawImage(maskedStrokeCanvas, 0, 0)
            surfaceEntry.paintOverlayCanvas = workingCanvas
            surfaceEntry.offscreenCanvas = composeTextLayerCanvases(
              currentLayer,
              surfaceEntry.maskCanvas,
              workingCanvas,
            ).composedCanvas
            drawRasterLayer(interaction.layerId)
          } else {
            const strokeCanvas = createTransparentCanvas(workingCanvas.width, workingCanvas.height)
            const strokeContext = strokeCanvas.getContext('2d')

            if (!strokeContext) {
              return
            }

            drawSmoothStroke(
              strokeContext,
              renderPoints,
              interaction.color,
              interaction.size,
            )

            const maskedStrokeCanvas = isAlphaLocked(currentLayer)
              ? createMaskedCanvas(strokeCanvas, interaction.restoreCanvas)
              : strokeCanvas
            const context = workingCanvas.getContext('2d')

            if (!context) {
              return
            }

            context.drawImage(maskedStrokeCanvas, 0, 0)
            surfaceEntry.offscreenCanvas = workingCanvas
            drawRasterLayer(interaction.layerId)
          }
        } else if (currentLayer.type !== 'text') {
          surfaceEntry.offscreenCanvas = workingCanvas
          drawRasterLayer(interaction.layerId)
        }

        interactionRef.current = {
          ...interaction,
          points: nextPoints,
          hasDragged,
          hasChanged: hasDragged,
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

      if (interaction.type === 'lasso') {
        const surfaceEntry = rasterSurfacesRef.current.get(interaction.layerId)
        const layerPoint = surfaceEntry?.offscreenCanvas && surfaceEntry.layerElement
          ? toLayerCoordinates(event, surfaceEntry.layerElement, surfaceEntry.offscreenCanvas)
          : null

        if (!layerPoint) {
          return
        }

        const nextPoints = appendLassoPoint(interaction.points, layerPoint)

        if (nextPoints === interaction.points) {
          return
        }

        interactionRef.current = {
          ...interaction,
          points: nextPoints,
          hasChanged: true,
        }
        setLassoSelection({
          sourceLayerId: interaction.layerId,
          points: nextPoints,
          isDrawing: true,
          isClosed: false,
          bounds: null,
        })
      }

      if (interaction.type === 'floating-selection-drag') {
        setFloatingSelection((currentSelection) => {
          if (!currentSelection) {
            return currentSelection
          }

          return {
            ...currentSelection,
            x: documentPoint.x - interaction.offsetX,
            y: documentPoint.y - interaction.offsetY,
          }
        })

        interactionRef.current = {
          ...interaction,
          hasChanged: true,
        }
      }
    }

    function handlePointerUp() {
      const interaction = interactionRef.current

      if (interaction?.type === 'pen') {
        const surfaceEntry = rasterSurfacesRef.current.get(interaction.layerId)
        const currentLayer = findLayer(documentState, interaction.layerId)

        if (surfaceEntry?.offscreenCanvas && currentLayer && interaction.restoreCanvas) {
          let previewCanvas = surfaceEntry.offscreenCanvas

          if (!interaction.hasDragged) {
            const tapCanvas = cloneCanvas(interaction.restoreCanvas)
            const tapPoint = interaction.points[0]

            if (tapPoint) {
              if (currentLayer.type === 'text') {
                const strokeCanvas = createTransparentCanvas(tapCanvas.width, tapCanvas.height)
                const strokeContext = strokeCanvas.getContext('2d')

                if (!strokeContext) {
                  setPenDrawingLayerId(null)
                  interactionRef.current = null
                  return
                }

                drawDot(
                  strokeContext,
                  tapPoint.x,
                  tapPoint.y,
                  interaction.color,
                  interaction.size,
                )

                const maskedTapCanvas = isAlphaLocked(currentLayer)
                  ? createMaskedCanvas(
                    strokeCanvas,
                    composeTextLayerCanvases(currentLayer, surfaceEntry.maskCanvas).visibleTextCanvas,
                  )
                  : strokeCanvas

                const overlayContext = tapCanvas.getContext('2d')

                if (!overlayContext) {
                  setPenDrawingLayerId(null)
                  interactionRef.current = null
                  return
                }

                overlayContext.drawImage(maskedTapCanvas, 0, 0)
                surfaceEntry.paintOverlayCanvas = tapCanvas
                previewCanvas = composeTextLayerCanvases(
                  currentLayer,
                  surfaceEntry.maskCanvas,
                  tapCanvas,
                ).composedCanvas
                surfaceEntry.offscreenCanvas = previewCanvas
              } else {
                const strokeCanvas = createTransparentCanvas(tapCanvas.width, tapCanvas.height)
                const strokeContext = strokeCanvas.getContext('2d')

                if (strokeContext) {
                  drawDot(
                    strokeContext,
                    tapPoint.x,
                    tapPoint.y,
                    interaction.color,
                    interaction.size,
                  )
                  const maskedTapCanvas = isAlphaLocked(currentLayer)
                    ? createMaskedCanvas(strokeCanvas, interaction.restoreCanvas)
                    : strokeCanvas
                  const context = tapCanvas.getContext('2d')

                  if (!context) {
                    setPenDrawingLayerId(null)
                    interactionRef.current = null
                    return
                  }

                  context.drawImage(maskedTapCanvas, 0, 0)
                  surfaceEntry.offscreenCanvas = tapCanvas
                  previewCanvas = tapCanvas
                }
              }

              drawRasterLayer(interaction.layerId)
            }
          }

          let nextCanvas = previewCanvas
          let nextX = currentLayer.x
          let nextY = currentLayer.y
          let nextWidth = currentLayer.width
          let nextHeight = currentLayer.height

          if (currentLayer.type === 'raster') {
            const nextBounds = getCanvasAlphaBounds(previewCanvas)

            if (nextBounds) {
              nextCanvas = cropCanvasToBounds(previewCanvas, nextBounds)
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

          if (currentLayer.type === 'text') {
            const nextPaintOverlayBitmap = surfaceEntry.paintOverlayCanvas
              ? canvasToBitmap(surfaceEntry.paintOverlayCanvas)
              : ''

            commit((currentDocument) =>
              updateLayer(currentDocument, interaction.layerId, {
                paintOverlayBitmap: nextPaintOverlayBitmap,
              }),
            )
          } else {
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

      if (interaction?.type === 'lasso') {
        const finalizedSelection = interaction.hasChanged
          ? finalizeLassoSelection(interaction.points)
          : null

        const nextSelection = finalizedSelection ? {
          ...finalizedSelection,
          sourceLayerId: interaction.layerId,
        } : null

        setLassoSelection(nextSelection)
        interactionRef.current = null

        if (nextSelection) {
          createFloatingSelectionFromLasso('move', nextSelection)
        }

        return
      }

      if (interaction?.type === 'floating-selection-drag') {
        setActiveMoveGuides(createEmptySnapGuides())
        interactionRef.current = null
        return
      }

      if (interaction?.originDocument && interaction.hasChanged) {
        commitTransientChange(interaction.originDocument)
      }

      setActiveMoveGuides(createEmptySnapGuides())
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
  }, [commit, commitTransientChange, documentState, drawRasterLayer, isSnapEnabled, setTransient, viewport])

  useEffect(() => {
    function handleKeyDown(event) {
      if (isEditableTarget(event.target)) {
        return
      }

      const lowerKey = event.key.toLowerCase()
      const selectedDocumentLayer = findLayer(documentState, documentState.selectedLayerId)

      if (event.key === 'Enter' && selectedDocumentLayer) {
        event.preventDefault()
        selectDocumentLayer(null)
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()

        if (floatingSelection) {
          deleteFloatingSelection()
          return
        }

        if (lassoSelection) {
          deleteSelectedLassoRegion()
          return
        }

        if (selectedDocumentLayer) {
          commit((currentDocument) => removeLayer(currentDocument, selectedDocumentLayer.id))
        }

        return
      }

      if (!(event.metaKey || event.ctrlKey)) {
        return
      }

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
        return
      }

      if (lowerKey === 'c') {
        if (!selectedDocumentLayer) {
          return
        }

        event.preventDefault()
        copiedLayerRef.current = selectedDocumentLayer
        return
      }

      if (lowerKey === 'v') {
        if (!copiedLayerRef.current) {
          return
        }

        event.preventDefault()
        commit((currentDocument) => {
          const sourceLayerId = copiedLayerRef.current.id
          const sourceLayer = findLayer(currentDocument, sourceLayerId) ?? copiedLayerRef.current
          const clonedLayer = cloneLayer(sourceLayer, {
            x: sourceLayer.x + 24,
            y: sourceLayer.y + 24,
          })

          return insertLayer(currentDocument, clonedLayer, sourceLayerId)
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [commit, deleteSelectedLassoRegion, deleteFloatingSelection, documentState, floatingSelection, lassoSelection, redo, undo])

  useEffect(() => {
    function handleDocumentPointerDown(event) {
      const canvas = canvasRef.current

      if (!canvas) {
        return
      }

      if (event.target instanceof HTMLElement && event.target.closest('.sidebar')) {
        return
      }

      if (canvas.contains(event.target)) {
        return
      }

      selectDocumentLayer(null)
    }

    window.addEventListener('pointerdown', handleDocumentPointerDown)

    return () => {
      window.removeEventListener('pointerdown', handleDocumentPointerDown)
    }
  }, [setTransient])

  function applyDocumentChange(updater) {
    commit((currentDocument) => updater(currentDocument))
  }

  function selectDocumentLayer(layerId) {
    setTransient((currentDocument) => selectLayer(currentDocument, layerId))
  }

  function addLayer(factory) {
    const nextLayer = factory()
    applyDocumentChange((currentDocument) => appendLayer(currentDocument, nextLayer))

    if (nextLayer.type === 'text') {
      setActiveTool('select')
    }
  }

  function resolvePenLayer(targetLayer) {
    const selectedDocumentLayer = findLayer(documentState, documentState.selectedLayerId)

    if (targetLayer && canPaintWithPenOnLayer(targetLayer)) {
      lastPenEditableLayerIdRef.current = targetLayer.id
      return targetLayer
    }

    if (selectedDocumentLayer && canPaintWithPenOnLayer(selectedDocumentLayer)) {
      lastPenEditableLayerIdRef.current = selectedDocumentLayer.id
      return selectedDocumentLayer
    }

    if (lastPenEditableLayerIdRef.current) {
      const lastPenEditableLayer = findLayer(documentState, lastPenEditableLayerIdRef.current)

      if (lastPenEditableLayer && canPaintWithPenOnLayer(lastPenEditableLayer)) {
        return lastPenEditableLayer
      }
    }

    const nextLayer = createRasterLayer({
      name: 'Drawing Layer',
    })

    lastPenEditableLayerIdRef.current = nextLayer.id
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
      setActiveTool('select')
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

  function applyTextLayerUpdate(layerId, updater, applyTransient = false) {
    const runner = applyTransient ? setTransient : applyDocumentChange

    runner((currentDocument) =>
      updateLayer(currentDocument, layerId, (layer) => (
        layer.type === 'text' ? updater(layer) : layer
      )),
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

    const documentPoint = toDocumentCoordinates(event, canvas, viewport)
    const { width, height } = getFrameDimensions(layer)

    if (!documentPoint) {
      return
    }

    selectDocumentLayer(layer.id)
    interactionRef.current = {
      type: 'move',
      layerId: layer.id,
      offsetX: documentPoint.x - layer.x,
      offsetY: documentPoint.y - layer.y,
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

    const documentPoint = toDocumentCoordinates(event, canvas, viewport)
    const { width, height } = getFrameDimensions(layer)

    if (!documentPoint) {
      return
    }

    selectDocumentLayer(layer.id)
    interactionRef.current = {
      type: 'resize',
      layerId: layer.id,
      layerType: layer.type,
      handle,
      pointerStart: {
        x: documentPoint.x,
        y: documentPoint.y,
      },
      startX: layer.x,
      startY: layer.y,
      startWidth: layer.width,
      startHeight: layer.height,
      startScaleX: layer.scaleX,
      startScaleY: layer.scaleY,
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
    const isRasterPenLayer = penLayer.type === 'raster'
    const isTextPenLayer = penLayer.type === 'text'
    const startPoint = isRasterPenLayer
      ? toDocumentCoordinates(event, canvasRef.current, viewport)
      : toLayerCoordinates(event, surfaceEntry?.layerElement, surfaceCanvas)

    if (!surfaceCanvas || !surfaceEntry || !startPoint) {
      return
    }

    let workingCanvas = null

    if (isRasterPenLayer) {
      workingCanvas = createTransparentCanvas(DOCUMENT_WIDTH, DOCUMENT_HEIGHT)
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
    } else if (isTextPenLayer) {
      const overlayCanvas = surfaceEntry.paintOverlayCanvas
        ?? createEmptyMaskCanvas(surfaceCanvas.width, surfaceCanvas.height)
      workingCanvas = cloneCanvas(overlayCanvas)
      surfaceEntry.paintOverlayCanvas = overlayCanvas
    } else {
      workingCanvas = cloneCanvas(surfaceCanvas)
    }

    const restoreCanvas = cloneCanvas(workingCanvas)
    surfaceEntry.offscreenCanvas = isTextPenLayer
      ? composeTextLayerCanvases(penLayer, surfaceEntry.maskCanvas, workingCanvas).composedCanvas
      : workingCanvas
    drawRasterLayer(penLayer.id)
    setPenDrawingLayerId(penLayer.id)

    interactionRef.current = {
      type: 'pen',
      layerId: penLayer.id,
      coordinateSpace: isRasterPenLayer ? 'document' : 'layer',
      points: [startPoint],
      color: penColor,
      size: penSize,
      minimumDistance: getStrokeMinimumDistance(penSize),
      dragThreshold: getStrokeDragThreshold(penSize),
      hasDragged: false,
      restoreCanvas,
      hasChanged: false,
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

  async function beginLasso(event, layer) {
    event.stopPropagation()
    event.preventDefault()

    if (!isRasterLayer(layer)) {
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

    selectDocumentLayer(layer.id)
    setFloatingSelection(null)

    const initialPoints = [layerPoint]

    setLassoSelection({
      sourceLayerId: layer.id,
      points: initialPoints,
      isDrawing: true,
      isClosed: false,
      bounds: null,
    })

    interactionRef.current = {
      type: 'lasso',
      layerId: layer.id,
      points: initialPoints,
      hasChanged: false,
    }
  }

  function beginFloatingSelectionDrag(event) {
    const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport)

    if (!floatingSelection || !documentPoint || !isPointInsideFloatingSelection(documentPoint, floatingSelection)) {
      return false
    }

    event.stopPropagation()
    event.preventDefault()

    interactionRef.current = {
      type: 'floating-selection-drag',
      offsetX: documentPoint.x - floatingSelection.x,
      offsetY: documentPoint.y - floatingSelection.y,
      hasChanged: false,
    }

    return true
  }

  function createSelectionFromFloating(
    nextFloatingSelection,
    sourceLayerId = nextFloatingSelection.sourceLayerId,
    layerOverride = null,
  ) {
    const sourceLayer = layerOverride ?? findLayer(documentState, sourceLayerId)

    if (!sourceLayer) {
      return null
    }

    const localOffsetX = (nextFloatingSelection.x - sourceLayer.x) / nextFloatingSelection.scaleX
    const localOffsetY = (nextFloatingSelection.y - sourceLayer.y) / nextFloatingSelection.scaleY

    const points = nextFloatingSelection.selectionPoints.map((point) => ({
      x: point.x + localOffsetX,
      y: point.y + localOffsetY,
    }))
    const finalizedSelection = finalizeLassoSelection(points)

    return finalizedSelection ? {
      ...finalizedSelection,
      sourceLayerId,
    } : null
  }

  async function createFloatingSelectionFromLasso(mode, selectionOverride = lassoSelection) {
    if (!selectionOverride) {
      return
    }

    const sourceLayer = findLayer(documentState, selectionOverride.sourceLayerId)

    if (!sourceLayer || !isRasterLayer(sourceLayer)) {
      return
    }

    const surfaceCanvas = await ensureRasterLayerSurface(sourceLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(sourceLayer.id)

    if (!surfaceCanvas || !surfaceEntry?.offscreenCanvas) {
      return
    }

    const restoreCanvas = cloneCanvas(surfaceEntry.offscreenCanvas)
    const nextFloatingSelection = buildFloatingSelection(
      sourceLayer,
      restoreCanvas,
      selectionOverride,
      mode,
      restoreCanvas,
    )

    if (!nextFloatingSelection) {
      return
    }

    if (mode === 'move') {
      clearSelectionFromCanvas(surfaceEntry.offscreenCanvas, selectionOverride)
      drawRasterLayer(sourceLayer.id)
    }

    setFloatingSelection(nextFloatingSelection)
    setLassoSelection(mode === 'duplicate' ? selectionOverride : null)
    selectDocumentLayer(sourceLayer.id)
  }

  async function commitFloatingSelectionToLayer(preserveSelection = true) {
    if (!floatingSelection) {
      return
    }

    const sourceLayer = findLayer(documentState, floatingSelection.sourceLayerId)

    if (!sourceLayer || !isRasterLayer(sourceLayer)) {
      return
    }

    const surfaceCanvas = await ensureRasterLayerSurface(sourceLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(sourceLayer.id)

    if (!surfaceCanvas || !surfaceEntry?.offscreenCanvas) {
      return
    }

    const destinationX = (floatingSelection.x - sourceLayer.x) / floatingSelection.scaleX
    const destinationY = (floatingSelection.y - sourceLayer.y) / floatingSelection.scaleY
    const currentCanvas = surfaceEntry.offscreenCanvas
    const minimumX = Math.min(0, destinationX)
    const minimumY = Math.min(0, destinationY)
    const maximumX = Math.max(currentCanvas.width, destinationX + floatingSelection.canvas.width)
    const maximumY = Math.max(currentCanvas.height, destinationY + floatingSelection.canvas.height)
    const needsExpansion = (
      minimumX < 0 ||
      minimumY < 0 ||
      maximumX > currentCanvas.width ||
      maximumY > currentCanvas.height
    )
    const targetCanvas = needsExpansion
      ? createTransparentCanvas(maximumX - minimumX, maximumY - minimumY)
      : currentCanvas
    const context = targetCanvas.getContext('2d')

    if (!context) {
      return
    }

    if (needsExpansion) {
      context.drawImage(currentCanvas, -minimumX, -minimumY)
    }

    context.drawImage(
      floatingSelection.canvas,
      destinationX - minimumX,
      destinationY - minimumY,
    )

    const nextLayerX = sourceLayer.x + (minimumX * floatingSelection.scaleX)
    const nextLayerY = sourceLayer.y + (minimumY * floatingSelection.scaleY)
    const nextLayerWidth = targetCanvas.width * floatingSelection.scaleX
    const nextLayerHeight = targetCanvas.height * floatingSelection.scaleY

    surfaceEntry.offscreenCanvas = targetCanvas
    drawRasterLayer(sourceLayer.id)

    commit((currentDocument) =>
      updateLayer(currentDocument, sourceLayer.id, {
        bitmap: canvasToBitmap(targetCanvas),
        x: nextLayerX,
        y: nextLayerY,
        width: nextLayerWidth,
        height: nextLayerHeight,
      }),
    )

    setLassoSelection(preserveSelection ? createSelectionFromFloating(
      floatingSelection,
      floatingSelection.sourceLayerId,
      {
        ...sourceLayer,
        x: nextLayerX,
        y: nextLayerY,
        width: nextLayerWidth,
        height: nextLayerHeight,
      },
    ) : null)
    setFloatingSelection(null)
  }

  async function commitFloatingSelectionToNewLayer() {
    if (floatingSelection) {
      const sourceLayer = findLayer(documentState, floatingSelection.sourceLayerId)

      if (!sourceLayer || !isRasterLayer(sourceLayer)) {
        return
      }

      const sourceSurface = await ensureRasterLayerSurface(sourceLayer)
      const sourceEntry = rasterSurfacesRef.current.get(sourceLayer.id)

      if (!sourceSurface || !sourceEntry?.offscreenCanvas) {
        return
      }

      const newLayer = createRasterLayer({
        name: `${sourceLayer.name} Selection`,
        x: floatingSelection.x,
        y: floatingSelection.y,
        width: Math.max(1, Math.round(floatingSelection.width)),
        height: Math.max(1, Math.round(floatingSelection.height)),
        bitmap: canvasToBitmap(floatingSelection.canvas),
      })

      commit((currentDocument) => {
        const nextDocument = floatingSelection.mode === 'move'
          ? updateLayer(currentDocument, sourceLayer.id, {
            bitmap: canvasToBitmap(sourceEntry.offscreenCanvas),
          })
          : currentDocument

        return insertLayer(nextDocument, newLayer, sourceLayer.id)
      })

      const nextSelection = finalizeLassoSelection(floatingSelection.selectionPoints)
      setLassoSelection(nextSelection ? {
        ...nextSelection,
        sourceLayerId: newLayer.id,
      } : null)
      setFloatingSelection(null)
      return
    }

    if (!lassoSelection) {
      return
    }

    const sourceLayer = findLayer(documentState, lassoSelection.sourceLayerId)

    if (!sourceLayer || !isRasterLayer(sourceLayer)) {
      return
    }

    const sourceSurface = await ensureRasterLayerSurface(sourceLayer)

    if (!sourceSurface) {
      return
    }

    const extractedCanvas = buildFloatingSelection(
      sourceLayer,
      sourceSurface,
      lassoSelection,
      'duplicate',
    )

    if (!extractedCanvas) {
      return
    }

    const newLayer = createRasterLayer({
      name: `${sourceLayer.name} Selection`,
      x: extractedCanvas.x,
      y: extractedCanvas.y,
      width: Math.max(1, Math.round(extractedCanvas.width)),
      height: Math.max(1, Math.round(extractedCanvas.height)),
      bitmap: canvasToBitmap(extractedCanvas.canvas),
    })

    commit((currentDocument) => insertLayer(currentDocument, newLayer, sourceLayer.id))

    const nextSelection = finalizeLassoSelection(extractedCanvas.selectionPoints)
    setLassoSelection(nextSelection ? {
      ...nextSelection,
      sourceLayerId: newLayer.id,
    } : null)
  }

  function cancelFloatingSelection() {
    if (floatingSelection?.mode === 'move' && floatingSelection.restoreCanvas) {
      const surfaceEntry = rasterSurfacesRef.current.get(floatingSelection.sourceLayerId)

      if (surfaceEntry) {
        surfaceEntry.offscreenCanvas = cloneCanvas(floatingSelection.restoreCanvas)
        drawRasterLayer(floatingSelection.sourceLayerId)
      }
    }

    setFloatingSelection(null)
  }

  async function deleteFloatingSelection() {
    if (!floatingSelection) {
      return
    }

    if (floatingSelection.mode === 'move') {
      const sourceLayer = findLayer(documentState, floatingSelection.sourceLayerId)
      const sourceEntry = rasterSurfacesRef.current.get(floatingSelection.sourceLayerId)

      if (!sourceLayer || !sourceEntry?.offscreenCanvas) {
        return
      }

      commit((currentDocument) =>
        updateLayer(currentDocument, sourceLayer.id, {
          bitmap: canvasToBitmap(sourceEntry.offscreenCanvas),
        }),
      )
    }

    setFloatingSelection(null)
    setLassoSelection(null)
  }

  async function deleteSelectedLassoRegion() {
    if (!lassoSelection) {
      return
    }

    const sourceLayer = findLayer(documentState, lassoSelection.sourceLayerId)

    if (!sourceLayer || !isRasterLayer(sourceLayer)) {
      return
    }

    const surfaceCanvas = await ensureRasterLayerSurface(sourceLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(sourceLayer.id)

    if (!surfaceCanvas || !surfaceEntry?.offscreenCanvas) {
      return
    }

    const workingCanvas = cloneCanvas(surfaceEntry.offscreenCanvas)
    clearSelectionFromCanvas(workingCanvas, lassoSelection)

    commit((currentDocument) =>
      updateLayer(currentDocument, sourceLayer.id, {
        bitmap: canvasToBitmap(workingCanvas),
      }),
    )

    setLassoSelection(null)
  }

  function handleLayerPointerDown(event, layer) {
    if (currentTool === 'zoom') {
      handleZoomPointer(event)
      return
    }

    if (currentTool === 'lasso') {
      if (beginFloatingSelectionDrag(event)) {
        return
      }

      if (floatingSelection) {
        void commitFloatingSelectionToLayer(false)
        return
      }

      if (lassoSelection?.sourceLayerId === layer.id) {
        const surfaceEntry = rasterSurfacesRef.current.get(layer.id)
        const surfaceCanvas = surfaceEntry?.offscreenCanvas
        const layerPoint = surfaceCanvas && surfaceEntry?.layerElement
          ? toLayerCoordinates(event, surfaceEntry.layerElement, surfaceCanvas)
          : null

        if (layerPoint && !isPointInsidePolygon(layerPoint, lassoSelection.points)) {
          event.stopPropagation()
          event.preventDefault()
          setLassoSelection(null)
          return
        }
      }

      beginLasso(event, layer)
      return
    }

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
    if (currentTool === 'zoom') {
      handleZoomPointer(event)
      return
    }

    if (currentTool === 'lasso') {
      if (beginFloatingSelectionDrag(event)) {
        return
      }

      if (!(event.target instanceof HTMLElement) || !event.target.closest('.canvas-layer')) {
        if (floatingSelection) {
          void commitFloatingSelectionToLayer(false)
        } else if (lassoSelection) {
          setLassoSelection(null)
        }

        selectDocumentLayer(null)
      }

      return
    }

    if (currentTool === 'pen') {
      if (selectedLayer?.type === 'raster') {
        beginPenStroke(event, selectedLayer)
      }
      return
    }

    if (!(event.target instanceof HTMLElement) || !event.target.closest('.canvas-layer')) {
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

    const resolvedValue = minimum === null ? numericValue : Math.max(minimum, numericValue)

    if (selectedLayer.type === 'text') {
      if (key === 'fontSize') {
        applyTextLayerUpdate(selectedLayer.id, (layer) => updateTextStyle(layer, {
          fontSize: resolvedValue,
        }))
        return
      }

      if (key === 'width') {
        if (selectedLayer.mode === 'box') {
          applyTextLayerUpdate(selectedLayer.id, (layer) => resizeBoxText(layer, resolvedValue))
          return
        }

        applyTextLayerUpdate(selectedLayer.id, (layer) => resizePointTextTransform(
          layer,
          Math.max(0.1, resolvedValue / Math.max(layer.measuredWidth ?? layer.width, 1)),
          layer.scaleY,
        ))
        return
      }

      if (key === 'height') {
        if (selectedLayer.mode === 'box') {
          applyTextLayerUpdate(
            selectedLayer.id,
            (layer) => resizeBoxText(layer, layer.boxWidth ?? layer.width, resolvedValue),
          )
          return
        }

        applyTextLayerUpdate(selectedLayer.id, (layer) => resizePointTextTransform(
          layer,
          layer.scaleX,
          Math.max(0.1, resolvedValue / Math.max(layer.measuredHeight ?? layer.height, 1)),
        ))
        return
      }
    }

    updateSelectedLayer({
      [key]: resolvedValue,
    })
  }

  function handleZoomPointer(event) {
    event.stopPropagation()
    event.preventDefault()

    const pointerPosition = getPointerPositionWithinElement(event, canvasRef.current)

    if (!pointerPosition) {
      return
    }

    const zoomFactor = event.altKey ? 1 / VIEWPORT_ZOOM_STEP : VIEWPORT_ZOOM_STEP

    setViewport((currentViewport) => zoomAtPoint(
      currentViewport,
      pointerPosition.x,
      pointerPosition.y,
      zoomFactor,
      MIN_VIEWPORT_ZOOM,
      MAX_VIEWPORT_ZOOM,
    ))
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
    applyTextLayerUpdate(
      layerId,
      (layer) => updateTextContent(layer, nextText),
      applyTransient,
    )
  }

  function getLayerDropPlacement(event) {
    const targetElement = event.currentTarget
    const bounds = targetElement.getBoundingClientRect()
    const pointerOffsetY = event.clientY - bounds.top

    return pointerOffsetY < bounds.height / 2 ? 'after' : 'before'
  }

  function handleLayerDragStart(event, layerId) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', layerId)

    if (dragPreviewImageRef.current) {
      event.dataTransfer.setDragImage(dragPreviewImageRef.current, 14, 14)
    }

    setDraggedLayerId(layerId)
    setLayerDropTarget(null)
  }

  function handleLayerDragOver(event, layerId) {
    if (!draggedLayerId) {
      return
    }

    event.preventDefault()

    const placement = getLayerDropPlacement(event)

    setLayerDropTarget((currentTarget) => (
      currentTarget?.layerId === layerId && currentTarget.placement === placement
        ? currentTarget
        : { layerId, placement }
    ))
  }

  function handleLayerDrop(event, layerId, actualIndex) {
    if (!draggedLayerId) {
      return
    }

    event.preventDefault()

    const placement = getLayerDropPlacement(event)
    const targetIndex = placement === 'after' ? actualIndex + 1 : actualIndex

    applyDocumentChange((currentDocument) => moveLayerToIndex(
      currentDocument,
      draggedLayerId,
      targetIndex,
    ))
    selectDocumentLayer(draggedLayerId)
    setDraggedLayerId(null)
    setLayerDropTarget(null)
  }

  function handleLayerDragEnd() {
    setDraggedLayerId(null)
    setLayerDropTarget(null)
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
    const showPenCursor = currentTool === 'pen' && canPaintWithPenOnLayer(layer)
    const showLassoCursor = currentTool === 'lasso' && isRasterLayer(layer)
    const showPenSurface = showPenCursor && penDrawingLayerId === layer.id && layer.type === 'raster'
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
            : showLassoCursor
              ? 'canvas-layer lasso-enabled'
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

                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
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

        {isSelected && currentTool === 'select' && (
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
              onClick={() => setActiveTool('eraser')}
              aria-label="Eraser"
            >
              Eraser
            </button>
            <button
              className={currentTool === 'lasso' ? 'action-button active' : 'action-button'}
              type="button"
              onClick={() => setActiveTool('lasso')}
              aria-label="Lasso"
            >
              Lasso
            </button>
            <button
              className={currentTool === 'zoom' ? 'action-button active' : 'action-button'}
              type="button"
              onClick={() => setActiveTool('zoom')}
              onDoubleClick={() => setViewport({ zoom: 1, offsetX: 0, offsetY: 0 })}
              aria-label="Zoom"
            >
              Zoom
            </button>
            <div className="toolbar-range">
              <span>View</span>
              <strong>{zoomLabel}</strong>
            </div>
            <button
              className={isSnapEnabled ? 'action-button active' : 'action-button'}
              type="button"
              onClick={() => {
                setIsSnapEnabled((currentValue) => {
                  if (currentValue) {
                    setActiveMoveGuides(createEmptySnapGuides())
                  }

                  return !currentValue
                })
              }}
              aria-pressed={isSnapEnabled}
            >
              {isSnapEnabled ? 'Snap On' : 'Snap Off'}
            </button>
            {(currentTool === 'pen' || currentTool === 'eraser') && (
              <>
                <label className="toolbar-range toolbar-color">
                  <span>Pen</span>
                  <input
                    type="color"
                    value={penColor}
                    onChange={(event) => setPenColor(event.target.value)}
                  />
                </label>
                <label className="toolbar-range">
                  <span>{activeBrushTool === 'pen' ? 'Brush' : 'Eraser'}</span>
                  <input
                    type="range"
                    min={activeBrushTool === 'pen' ? '2' : '8'}
                    max={activeBrushTool === 'pen' ? '64' : '96'}
                    step="1"
                    value={activeBrushTool === 'pen' ? penSize : eraserSize}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value)

                      if (activeBrushTool === 'pen') {
                        setPenSize(nextValue)
                        return
                      }

                      setEraserSize(nextValue)
                    }}
                  />
                  <strong>{activeBrushTool === 'pen' ? penSize : eraserSize}</strong>
                </label>
              </>
            )}
            <button
              className="action-button"
              type="button"
              disabled={!hasActiveLassoSelection}
              onClick={() => createFloatingSelectionFromLasso('move')}
            >
              Move Sel
            </button>
            <button
              className="action-button"
              type="button"
              disabled={!hasActiveLassoSelection}
              onClick={() => createFloatingSelectionFromLasso('duplicate')}
            >
              Dup Sel
            </button>
            <button
              className="action-button"
              type="button"
              disabled={!hasFloatingSelection && !hasActiveLassoSelection}
              onClick={commitFloatingSelectionToNewLayer}
            >
              Sel to Layer
            </button>
            <button
              className="action-button"
              type="button"
              disabled={!hasActiveLassoSelection}
              onClick={deleteSelectedLassoRegion}
            >
              Delete Sel
            </button>
            <button
              className="action-button"
              type="button"
              disabled={!hasFloatingSelection}
              onClick={commitFloatingSelectionToLayer}
            >
              Commit Sel
            </button>
            <button
              className="action-button"
              type="button"
              disabled={!hasFloatingSelection && !hasActiveLassoSelection}
              onClick={() => {
                cancelFloatingSelection()
                setLassoSelection(null)
              }}
            >
              Cancel Sel
            </button>
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
                <div
                  className="canvas-viewport"
                  style={{
                    transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.zoom})`,
                  }}
                >
                  <div ref={canvasSurfaceRef} className="canvas-surface">
                    {documentState.layers.map(renderLayer)}
                    <canvas ref={overlayCanvasRef} className="canvas-overlay" aria-hidden="true" />
                  </div>
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
                  const isDragging = layer.id === draggedLayerId
                  const dropPlacement = layerDropTarget?.layerId === layer.id
                    ? layerDropTarget.placement
                    : null

                  return (
                    <div
                      key={layer.id}
                      className={[
                        'layer-row',
                        isSelected ? 'selected' : '',
                        isDragging ? 'dragging' : '',
                        dropPlacement === 'before' ? 'drop-before' : '',
                        dropPlacement === 'after' ? 'drop-after' : '',
                      ].filter(Boolean).join(' ')}
                      draggable
                      onClick={() => selectDocumentLayer(layer.id)}
                      onDragStart={(event) => handleLayerDragStart(event, layer.id)}
                      onDragOver={(event) => handleLayerDragOver(event, layer.id)}
                      onDrop={(event) => handleLayerDrop(event, layer.id, actualIndex)}
                      onDragEnd={handleLayerDragEnd}
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
                          draggable={false}
                        />
                        <div className="layer-chip-row">
                          <span className="layer-type-chip">{layer.type}</span>
                          {isAlphaLocked(layer) && (
                            <span className="layer-flag-chip">alpha lock</span>
                          )}
                        </div>
                      </div>

                      <div className="row-actions">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            applyDocumentChange((currentDocument) =>
                              duplicateLayer(currentDocument, layer.id),
                            )
                          }}
                          aria-label="Duplicate layer"
                        >
                          Dup
                        </button>
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
                    <label className="property-field full-width">
                      <span>Lock Transparent Pixels</span>
                      <button
                        className={isAlphaLocked(selectedLayer)
                          ? 'action-button active'
                          : 'action-button'}
                        type="button"
                        disabled={!canLayerLockTransparentPixels(selectedLayer)}
                        onClick={() =>
                          applyDocumentChange((currentDocument) =>
                            setLayerAlphaLock(
                              currentDocument,
                              selectedLayer.id,
                              !isAlphaLocked(selectedLayer),
                            ),
                          )
                        }
                      >
                        {isAlphaLocked(selectedLayer) ? 'Alpha Lock On' : 'Alpha Lock Off'}
                      </button>
                    </label>
                    {!canLayerLockTransparentPixels(selectedLayer) && (
                      <div className="group-note full-width">
                        Alpha lock is only supported on raster, image, and text layers in this MVP.
                      </div>
                    )}

                    {selectedLayer.type === 'text' && (
                      <>
                        <label className="property-field">
                          <span>Text Mode</span>
                          <select
                            value={selectedLayer.mode}
                            onChange={(event) =>
                              applyTextLayerUpdate(selectedLayer.id, (layer) => updateTextStyle(
                                layer,
                                {
                                  mode: event.target.value,
                                  boxWidth: event.target.value === 'box'
                                    ? layer.boxWidth ?? layer.measuredWidth
                                    : null,
                                  boxHeight: event.target.value === 'box'
                                    ? layer.boxHeight ?? layer.measuredHeight
                                    : null,
                                },
                              ))
                            }
                          >
                            <option value="point">Point</option>
                            <option value="box">Box</option>
                          </select>
                        </label>
                        <label className="property-field">
                          <span>Font</span>
                          <select
                            value={selectedLayer.fontFamily}
                            onChange={(event) =>
                              applyTextLayerUpdate(
                                selectedLayer.id,
                                (layer) => updateTextLayerFont(layer, event.target.value),
                              )
                            }
                          >
                            {FONT_FAMILY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
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
                            onChange={(event) =>
                              handleNumericChange('fontSize', event.target.value, 8)
                            }
                          />
                        </label>
                        <label className="property-field">
                          <span>Weight</span>
                          <button
                            className={selectedLayer.fontWeight >= 700
                              ? 'action-button active'
                              : 'action-button'}
                            type="button"
                            onClick={() =>
                              applyTextLayerUpdate(selectedLayer.id, (layer) => updateTextStyle(
                                layer,
                                {
                                  fontWeight: layer.fontWeight >= 700 ? 400 : 700,
                                },
                              ))
                            }
                          >
                            Bold
                          </button>
                        </label>
                        {selectedLayer.mode === 'box' && (
                          <label className="property-field">
                            <span>Box Width</span>
                            <input
                              type="number"
                              min={MIN_LAYER_WIDTH}
                              value={selectedLayer.boxWidth ?? selectedLayer.width}
                              onChange={(event) =>
                                applyTextLayerUpdate(
                                  selectedLayer.id,
                                  (layer) => resizeBoxText(
                                    layer,
                                    Math.max(MIN_LAYER_WIDTH, Number(event.target.value) || layer.width),
                                    layer.boxHeight ?? layer.height,
                                  ),
                                )
                              }
                            />
                          </label>
                        )}
                        <label className="property-field">
                          <span>Color</span>
                          <input
                            type="color"
                            value={selectedLayer.color}
                            onChange={(event) => updateSelectedLayer({ color: event.target.value })}
                          />
                        </label>
                        <div className="group-note full-width">
                          Text paint stays in a separate overlay bitmap so the text remains editable.
                          Large text or font changes keep the overlay positioned in the layer frame,
                          but do not remap old paint to new glyph shapes.
                        </div>
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
                          Image layers support alpha lock and direct pixel painting inside the image
                          frame. Transparent pixels stay protected while alpha lock is enabled.
                        </div>
                      </>
                    )}

                    {selectedLayer.type === 'raster' && (
                      <div className="group-note full-width">
                        Drawing layers support alpha lock, and each pen stroke still commits as a
                        single bitmap history step.
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
