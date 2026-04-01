import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import addImageIcon from './assets/add image.svg'
import addTextIcon from './assets/add text.svg'
import bucketIcon from './assets/bucket.svg'
import closeIcon from './assets/Close (X).svg'
import duplicateIcon from './assets/duplicate.svg'
import downIcon from './assets/down.svg'
import eraserIcon from './assets/eraser.svg'
import gradientIcon from './assets/gradient.svg'
import heroImage from './assets/hero.png'
import hiddenIcon from './assets/Hidden.svg'
import lassoIcon from './assets/lasso.svg'
import mergeDownIcon from './assets/merge down.svg'
import penIcon from './assets/pen.svg'
import pointerIcon from './assets/pointer.svg'
import redoIcon from './assets/redo.svg'
import undoIcon from './assets/undo.svg'
import upIcon from './assets/up.svg'
import visibleIcon from './assets/Visible.svg'
import zoomIcon from './assets/zoom.svg'
import { useHistory } from './hooks/useHistory'
import { eraseDot, eraseStroke, paintMaskDot, paintMaskStroke } from './lib/eraserTool'
import {
  createDefaultColors,
  loadColorsFromStorage,
  saveColorsToStorage,
  swapGlobalColors,
} from './lib/colors'
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
  canMergeDown,
  clearSelection,
  cloneLayer,
  createDocument,
  createGroupLayer,
  createImageLayer,
  createRasterLayer,
  createShapeLayer,
  createTextLayer,
  duplicateLayer,
  findLayer,
  getLayerBelow,
  getSelectedLayers,
  isAlphaLocked,
  isErasableLayer,
  isLayerSelected,
  insertLayer,
  isSvgImageLayer,
  isRasterLayer,
  mergeLayerDown,
  moveLayer,
  moveLayerToIndex,
  removeLayer,
  selectSingleLayer,
  setLayerAlphaLock,
  toggleLayerInSelection,
  updateLayer,
} from './lib/layers'
import {
  applyEraseMask,
  applyLinearGradientToCanvas,
  canvasToBitmap,
  cloneCanvas,
  composeTextLayerCanvases,
  createSizedCanvas,
  createMaskedCanvas,
  cropCanvasToBounds,
  createCanvasFromSource,
  createTransparentCanvas,
  createMaskCanvasFromSource,
  createEmptyMaskCanvas,
  floodFillCanvas,
  getCanvasAlphaBounds,
  inferImageSourceKindFromSrc,
  loadImageDimensionsFromSource,
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
import { exportDocumentImage } from './lib/exportDocument'
import { downloadProjectFile, normalizeDocumentState, parseProjectFile } from './lib/documentFiles'

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
const DEFAULT_BUCKET_TOLERANCE = 200
const DOCUMENT_WIDTH = 1080
const DOCUMENT_HEIGHT = 1440
const DISPLAY_DOCUMENT_WIDTH = 428
const BASE_DOCUMENT_SCALE = DISPLAY_DOCUMENT_WIDTH / DOCUMENT_WIDTH
const MIN_VIEWPORT_ZOOM = 0.1
const MAX_VIEWPORT_ZOOM = 8
const VIEWPORT_ZOOM_STEP = 1.25
const ASSET_DRAG_MIME_TYPE = 'application/x-fukmall-asset-id'

function isSupportedAssetFile(file) {
  return Boolean(file) && /^image\/(png|jpeg|jpg|svg\+xml|webp)$/i.test(file.type)
}

function getAssetKind(file) {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.png')) {
    return 'png'
  }

  if (lowerName.endsWith('.jpg')) {
    return 'jpg'
  }

  if (lowerName.endsWith('.jpeg')) {
    return 'jpeg'
  }

  if (lowerName.endsWith('.svg')) {
    return 'svg'
  }

  if (lowerName.endsWith('.webp')) {
    return 'webp'
  }

  return 'png'
}

function getImportedSourceKind(file, src) {
  if (file?.type === 'image/svg+xml' || file?.name?.toLowerCase().endsWith('.svg')) {
    return 'svg'
  }

  return inferImageSourceKindFromSrc(src)
}

async function importAssetsFromFiles(files) {
  const supportedFiles = Array.from(files ?? []).filter(isSupportedAssetFile)

  return Promise.all(supportedFiles.map(async (file) => {
    const src = await readFileAsDataUrl(file)
    const sourceKind = getImportedSourceKind(file, src)
    const dimensions = await loadImageDimensionsFromSource(src)

    return {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, '') || file.name,
      src,
      kind: getAssetKind(file),
      sourceKind,
      width: dimensions.width,
      height: dimensions.height,
    }
  }))
}

function getLayerTransformBounds(layer) {
  const angle = (layer.rotation * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const corners = [
    { x: 0, y: 0 },
    { x: layer.width, y: 0 },
    { x: layer.width, y: layer.height },
    { x: 0, y: layer.height },
  ].map((point) => {
    const scaledX = point.x * layer.scaleX
    const scaledY = point.y * layer.scaleY

    return {
      x: layer.x + (scaledX * cosine) - (scaledY * sine),
      y: layer.y + (scaledX * sine) + (scaledY * cosine),
    }
  })

  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y)),
  }
}

function getMergedLayerBounds(...layers) {
  const bounds = layers.map((layer) => getLayerTransformBounds(layer))

  return {
    minX: Math.floor(Math.min(...bounds.map((bound) => bound.minX))),
    minY: Math.floor(Math.min(...bounds.map((bound) => bound.minY))),
    maxX: Math.ceil(Math.max(...bounds.map((bound) => bound.maxX))),
    maxY: Math.ceil(Math.max(...bounds.map((bound) => bound.maxY))),
  }
}

function getSelectionBoundsFromLayers(layers) {
  if (!layers.length) {
    return null
  }

  const bounds = layers.map((layer) => getLayerTransformBounds(layer))

  const minX = Math.floor(Math.min(...bounds.map((bound) => bound.minX)))
  const minY = Math.floor(Math.min(...bounds.map((bound) => bound.minY)))
  const maxX = Math.ceil(Math.max(...bounds.map((bound) => bound.maxX)))
  const maxY = Math.ceil(Math.max(...bounds.map((bound) => bound.maxY)))

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    minX,
    minY,
    maxX,
    maxY,
  }
}

function drawRoundedRect(context, width, height, radius) {
  const nextRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.moveTo(nextRadius, 0)
  context.lineTo(width - nextRadius, 0)
  context.quadraticCurveTo(width, 0, width, nextRadius)
  context.lineTo(width, height - nextRadius)
  context.quadraticCurveTo(width, height, width - nextRadius, height)
  context.lineTo(nextRadius, height)
  context.quadraticCurveTo(0, height, 0, height - nextRadius)
  context.lineTo(0, nextRadius)
  context.quadraticCurveTo(0, 0, nextRadius, 0)
  context.closePath()
}

function getFrameDimensions(layer) {
  return {
    width: Math.max(MIN_LAYER_WIDTH, layer.width * Math.max(Math.abs(layer.scaleX), 0.1)),
    height: Math.max(MIN_LAYER_HEIGHT, layer.height * Math.max(Math.abs(layer.scaleY), 0.1)),
  }
}

function createInitialDocument() {
  const whiteBackground = createShapeLayer({
    name: 'Background',
    x: 0,
    y: 0,
    width: DOCUMENT_WIDTH,
    height: DOCUMENT_HEIGHT,
    fill: '#ffffff',
    radius: 0,
  })
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
    [whiteBackground, background, card, title, group],
    background.id,
  )
}

function getImportedImageDimensions(width, height) {
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
}

function clampImportedImagePosition(x, y, width, height) {
  const maxX = DOCUMENT_WIDTH - width
  const maxY = DOCUMENT_HEIGHT - height

  return {
    x: maxX >= 0 ? Math.min(Math.max(0, x), maxX) : 0,
    y: maxY >= 0 ? Math.min(Math.max(0, y), maxY) : 0,
  }
}

function getDefaultImportedImagePosition(width, height) {
  return clampImportedImagePosition(
    Math.round((DOCUMENT_WIDTH - width) / 2),
    Math.round((DOCUMENT_HEIGHT - height) / 2),
    width,
    height,
  )
}

function createImageLayerBitmapPatch(layer, bitmap, overrides = {}) {
  if (layer?.type !== 'image') {
    return {
      bitmap,
      ...overrides,
    }
  }

  return {
    src: bitmap,
    bitmap,
    sourceKind: 'bitmap',
    ...overrides,
  }
}

function getSvgRasterSurfaceDimensions(layer) {
  const rasterScale = Math.max(
    Math.abs(layer.scaleX),
    Math.abs(layer.scaleY),
    1,
  )

  return {
    width: Math.max(1, Math.round(layer.width * rasterScale)),
    height: Math.max(1, Math.round(layer.height * rasterScale)),
  }
}

function createMoveAxisLockState() {
  return {
    shiftLockedAxis: null,
    shiftWasHeld: false,
    shiftLockPointerOrigin: null,
    shiftLockPositionOrigin: null,
  }
}

function applyAxisLockedMove(interaction, documentPoint, nextX, nextY, shiftHeld) {
  let nextInteraction = interaction
  let constrainedX = nextX
  let constrainedY = nextY

  if (!shiftHeld) {
    if (
      interaction.shiftLockedAxis !== null ||
      interaction.shiftWasHeld ||
      interaction.shiftLockPointerOrigin ||
      interaction.shiftLockPositionOrigin
    ) {
      nextInteraction = {
        ...interaction,
        ...createMoveAxisLockState(),
      }
    }

    return {
      interaction: nextInteraction,
      x: constrainedX,
      y: constrainedY,
      lockedAxis: null,
    }
  }

  if (!interaction.shiftWasHeld) {
    nextInteraction = {
      ...interaction,
      shiftWasHeld: true,
      shiftLockedAxis: null,
      shiftLockPointerOrigin: {
        x: documentPoint.x,
        y: documentPoint.y,
      },
      shiftLockPositionOrigin: {
        x: nextX,
        y: nextY,
      },
    }

    return {
      interaction: nextInteraction,
      x: constrainedX,
      y: constrainedY,
      lockedAxis: null,
    }
  }

  let lockedAxis = interaction.shiftLockedAxis

  if (!lockedAxis && interaction.shiftLockPointerOrigin) {
    const deltaX = documentPoint.x - interaction.shiftLockPointerOrigin.x
    const deltaY = documentPoint.y - interaction.shiftLockPointerOrigin.y

    if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
      lockedAxis = Math.abs(deltaX) >= Math.abs(deltaY) ? 'horizontal' : 'vertical'
      nextInteraction = {
        ...interaction,
        shiftLockedAxis: lockedAxis,
      }
    }
  }

  const positionOrigin = nextInteraction.shiftLockPositionOrigin ?? interaction.shiftLockPositionOrigin

  if (lockedAxis === 'horizontal' && positionOrigin) {
    constrainedY = positionOrigin.y
  }

  if (lockedAxis === 'vertical' && positionOrigin) {
    constrainedX = positionOrigin.x
  }

  return {
    interaction: nextInteraction,
    x: constrainedX,
    y: constrainedY,
    lockedAxis,
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
    ...screenToWorld(pointerPosition.x, pointerPosition.y, {
      ...viewport,
      zoom: viewport.zoom * BASE_DOCUMENT_SCALE,
    }),
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

function canFillLayerWithBucket(layer) {
  return (layer?.type === 'raster' || layer?.type === 'image') && !isSvgImageLayer(layer)
}

function canApplyGradientToLayer(layer) {
  return (layer?.type === 'raster' || layer?.type === 'image') && !isSvgImageLayer(layer)
}

function createTransparentColorFromHex(color) {
  if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) {
    return null
  }

  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
    a: 0,
  }
}

function layerLocalPointToDocumentPoint(layer, surfaceWidth, surfaceHeight, point) {
  if (!layer || !point || surfaceWidth <= 0 || surfaceHeight <= 0) {
    return null
  }

  const normalizedX = (point.x / surfaceWidth) * layer.width
  const normalizedY = (point.y / surfaceHeight) * layer.height
  const angle = (layer.rotation * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)

  return {
    x: layer.x + ((normalizedX * layer.scaleX) * cosine) - ((normalizedY * layer.scaleY) * sine),
    y: layer.y + ((normalizedX * layer.scaleX) * sine) + ((normalizedY * layer.scaleY) * cosine),
  }
}

function getFallbackSelectedLayerId(documentState, preferredLayerId = null) {
  if (!documentState.layers.length) {
    return null
  }

  if (preferredLayerId && findLayer(documentState, preferredLayerId)) {
    return preferredLayerId
  }

  return documentState.layers.at(-1)?.id ?? null
}

function App() {
  const canvasRef = useRef(null)
  const canvasSurfaceRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const assetLibraryInputRef = useRef(null)
  const imageInputRef = useRef(null)
  const openFileInputRef = useRef(null)
  const fileMenuRef = useRef(null)
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
    reset,
    canUndo,
    canRedo,
  } = useHistory(createInitialDocument())
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)
  const [editingTextLayerId, setEditingTextLayerId] = useState(null)
  const [textDraft, setTextDraft] = useState('')
  const [activeTool, setActiveTool] = useState('select')
  const [penDrawingLayerId, setPenDrawingLayerId] = useState(null)
  const [globalColors, setGlobalColors] = useState(() => loadColorsFromStorage())
  const [penSize, setPenSize] = useState(DEFAULT_PEN_SIZE)
  const [eraserSize, setEraserSize] = useState(DEFAULT_ERASER_SIZE)
  const [bucketTolerance, setBucketTolerance] = useState(DEFAULT_BUCKET_TOLERANCE)
  const [gradientMode, setGradientMode] = useState('bg-to-fg')
  const [gradientPreview, setGradientPreview] = useState(null)
  const [lassoSelection, setLassoSelection] = useState(null)
  const [floatingSelection, setFloatingSelection] = useState(null)
  const [draggedLayerId, setDraggedLayerId] = useState(null)
  const [layerDropTarget, setLayerDropTarget] = useState(null)
  const [assetLibrary, setAssetLibrary] = useState([])
  const [draggedAssetId, setDraggedAssetId] = useState(null)
  const [activeSvgToolLayerId, setActiveSvgToolLayerId] = useState(null)
  const [isCanvasAssetDropActive, setIsCanvasAssetDropActive] = useState(false)
  const [isSnapEnabled, setIsSnapEnabled] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [isOpeningFile, setIsOpeningFile] = useState(false)
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false)
  const [activeMoveGuides, setActiveMoveGuides] = useState(() => createEmptySnapGuides())
  const [viewport, setViewport] = useState({
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  })

  const selectedLayerIds = useMemo(() => (
    documentState.selectedLayerIds ?? (
      documentState.selectedLayerId ? [documentState.selectedLayerId] : []
    )
  ), [documentState.selectedLayerId, documentState.selectedLayerIds])
  const selectedLayers = getSelectedLayers(documentState)
  const selectedLayer = selectedLayers.length === 1
    ? selectedLayers[0]
    : findLayer(documentState, documentState.selectedLayerId)
  const selectionBounds = getSelectionBoundsFromLayers(selectedLayers)
  const hasMultiSelection = selectedLayerIds.length > 1
  const currentTool = activeTool
  const activeBrushTool = currentTool === 'eraser' ? 'eraser' : 'pen'
  const hasActiveLassoSelection = Boolean(lassoSelection?.isClosed)
  const hasFloatingSelection = Boolean(floatingSelection)

  const setForeground = useCallback((color) => {
    setGlobalColors((currentColors) => ({
      ...currentColors,
      foreground: color,
    }))
  }, [])

  const setBackground = useCallback((color) => {
    setGlobalColors((currentColors) => ({
      ...currentColors,
      background: color,
    }))
  }, [])

  const swapColors = useCallback(() => {
    setGlobalColors((currentColors) => swapGlobalColors(currentColors))
  }, [])

  const resetColors = useCallback(() => {
    setGlobalColors(createDefaultColors())
  }, [])

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
      const svgRasterSize = layer.type === 'image' && layer.sourceKind === 'svg'
        ? getSvgRasterSurfaceDimensions(layer)
        : null

      return JSON.stringify({
        type: layer.type,
        sourceKind: layer.sourceKind ?? 'bitmap',
        bitmap: layer.type === 'image' && layer.sourceKind === 'svg'
          ? layer.src ?? ''
          : layer.bitmap ?? '',
        width: layer.type === 'raster' ? layer.width : svgRasterSize?.width ?? null,
        height: layer.type === 'raster' ? layer.height : svgRasterSize?.height ?? null,
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
      const svgRasterSize = layer.sourceKind === 'svg'
        ? getSvgRasterSurfaceDimensions(layer)
        : null
      const imageSurface = await createCanvasFromSource(
        layer.sourceKind === 'svg' ? layer.src : layer.bitmap,
        svgRasterSize?.width ?? null,
        svgRasterSize?.height ?? null,
      )
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

  const drawLayerIntoMergeContext = useCallback(async (context, layer, offsetX, offsetY) => {
    if (!context || !layer.visible || layer.opacity <= 0) {
      return
    }

    context.save()
    context.globalAlpha = layer.opacity
    context.translate(layer.x - offsetX, layer.y - offsetY)
    context.rotate((layer.rotation * Math.PI) / 180)
    context.scale(layer.scaleX, layer.scaleY)

    if (layer.type === 'shape') {
      context.fillStyle = layer.fill
      drawRoundedRect(context, layer.width, layer.height, layer.radius)
      context.fill()
      context.restore()
      return
    }

    if (layer.type === 'group') {
      context.fillStyle = 'rgba(255, 247, 237, 0.92)'
      context.strokeStyle = 'rgba(120, 92, 55, 0.32)'
      context.lineWidth = 1
      drawRoundedRect(context, layer.width, layer.height, 24)
      context.fill()
      context.stroke()
      context.restore()
      return
    }

    const surfaceCanvas = await ensureRasterLayerSurface(layer)

    if (surfaceCanvas) {
      context.drawImage(surfaceCanvas, 0, 0, layer.width, layer.height)
    }

    context.restore()
  }, [ensureRasterLayerSurface])

  async function handleMergeDown(layerId = documentState.selectedLayerId) {
    if (!layerId) {
      return
    }

    if (!canMergeDown(documentState, layerId)) {
      return
    }

    const currentLayer = findLayer(documentState, layerId)

    if (!currentLayer) {
      return
    }

    const layerBelow = getLayerBelow(documentState, currentLayer.id)

    if (!layerBelow) {
      return
    }

    const bounds = getMergedLayerBounds(layerBelow, currentLayer)
    const mergedWidth = Math.max(1, bounds.maxX - bounds.minX)
    const mergedHeight = Math.max(1, bounds.maxY - bounds.minY)
    const mergeCanvas = createSizedCanvas(mergedWidth, mergedHeight)
    const mergeContext = mergeCanvas.getContext('2d')

    if (!mergeContext) {
      return
    }

    await drawLayerIntoMergeContext(mergeContext, layerBelow, bounds.minX, bounds.minY)
    await drawLayerIntoMergeContext(mergeContext, currentLayer, bounds.minX, bounds.minY)

    const mergedLayer = createRasterLayer({
      name: 'Merged Layer',
      x: bounds.minX,
      y: bounds.minY,
      width: mergedWidth,
      height: mergedHeight,
      bitmap: canvasToBitmap(mergeCanvas),
    })

    commit((currentDocument) => mergeLayerDown(currentDocument, currentLayer.id, mergedLayer))
  }

  useEffect(() => {
    const dragPreviewImage = new Image()
    dragPreviewImage.src = addImageIcon
    dragPreviewImageRef.current = dragPreviewImage

    return () => {
      dragPreviewImageRef.current = null
    }
  }, [])

  useEffect(() => {
    saveColorsToStorage(globalColors)
  }, [globalColors])

  useEffect(() => {
    function handlePointerDownOutside(event) {
      if (!isFileMenuOpen) {
        return
      }

      if (fileMenuRef.current instanceof HTMLElement && fileMenuRef.current.contains(event.target)) {
        return
      }

      setIsFileMenuOpen(false)
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsFileMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDownOutside)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isFileMenuOpen])

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
    const currentLayerIds = new Set(documentState.layers.map((layer) => layer.id))
    const nextSelectedLayerIds = selectedLayerIds.filter((layerId) => currentLayerIds.has(layerId))

    if (nextSelectedLayerIds.length !== selectedLayerIds.length) {
      const fallbackSelectedLayerId = getFallbackSelectedLayerId(
        documentState,
        nextSelectedLayerIds.at(-1) ?? documentState.selectedLayerId,
      )
      setTransient((currentDocument) => ({
        ...currentDocument,
        selectedLayerId: fallbackSelectedLayerId,
        selectedLayerIds: fallbackSelectedLayerId
          ? (nextSelectedLayerIds.length > 0 ? nextSelectedLayerIds : [fallbackSelectedLayerId])
          : [],
      }))
      return
    }

    if (!selectedLayerIds.length && documentState.layers.length > 0) {
      const fallbackSelectedLayerId = getFallbackSelectedLayerId(documentState)

      if (!fallbackSelectedLayerId) {
        return
      }

      setTransient((currentDocument) => ({
        ...currentDocument,
        selectedLayerId: fallbackSelectedLayerId,
        selectedLayerIds: [fallbackSelectedLayerId],
      }))
      return
    }

    if (lassoSelection && !findLayer(documentState, lassoSelection.sourceLayerId)) {
      setLassoSelection(null)
    }

    if (floatingSelection && !findLayer(documentState, floatingSelection.sourceLayerId)) {
      setFloatingSelection(null)
    }

    if (
      gradientPreview &&
      !documentState.layers.some((layer) => layer.id === gradientPreview.layerId)
    ) {
      setGradientPreview(null)
    }

    if (lastPenEditableLayerIdRef.current) {
      const lastPenEditableLayer = findLayer(documentState, lastPenEditableLayerIdRef.current)

      if (!lastPenEditableLayer || !canPaintWithPenOnLayer(lastPenEditableLayer)) {
        lastPenEditableLayerIdRef.current = null
      }
    }
  }, [documentState, floatingSelection, gradientPreview, lassoSelection, selectedLayerIds, setTransient])

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

    if (gradientPreview) {
      const previewStart = layerLocalPointToDocumentPoint(
        gradientPreview.layer,
        gradientPreview.surfaceWidth,
        gradientPreview.surfaceHeight,
        gradientPreview.startPoint,
      )
      const previewEnd = layerLocalPointToDocumentPoint(
        gradientPreview.layer,
        gradientPreview.surfaceWidth,
        gradientPreview.surfaceHeight,
        gradientPreview.endPoint,
      )

      if (previewStart && previewEnd) {
      context.save()
      context.strokeStyle = '#0f766e'
      context.fillStyle = '#fffaf2'
      context.lineWidth = 2
      context.setLineDash([])
      context.beginPath()
      context.moveTo(previewStart.x, previewStart.y)
      context.lineTo(previewEnd.x, previewEnd.y)
      context.stroke()

      context.beginPath()
      context.arc(previewStart.x, previewStart.y, 6, 0, Math.PI * 2)
      context.fill()
      context.stroke()

      context.beginPath()
      context.arc(previewEnd.x, previewEnd.y, 4.5, 0, Math.PI * 2)
      context.fill()
      context.stroke()
      context.restore()
      }
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
  }, [activeMoveGuides, documentState, floatingSelection, gradientPreview, lassoSelection])

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
        const nextPosition = applyAxisLockedMove(
          interaction,
          documentPoint,
          documentPoint.x - interaction.offsetX,
          documentPoint.y - interaction.offsetY,
          event.shiftKey,
        )
        const snapResult = applyMoveSnapping(
          nextPosition.x,
          nextPosition.y,
          interaction.frameWidth,
          interaction.frameHeight,
          DOCUMENT_WIDTH,
          DOCUMENT_HEIGHT,
          {
            enabled: isSnapEnabled,
            enabledX: nextPosition.lockedAxis !== 'vertical',
            enabledY: nextPosition.lockedAxis !== 'horizontal',
            threshold: DEFAULT_SNAP_THRESHOLD,
          },
        )
        interactionRef.current = {
          ...nextPosition.interaction,
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

      if (interaction.type === 'move-multi') {
        const nextPosition = applyAxisLockedMove(
          interaction,
          documentPoint,
          documentPoint.x - interaction.offsetX,
          documentPoint.y - interaction.offsetY,
          event.shiftKey,
        )
        const snapResult = applyMoveSnapping(
          nextPosition.x,
          nextPosition.y,
          interaction.frameWidth,
          interaction.frameHeight,
          DOCUMENT_WIDTH,
          DOCUMENT_HEIGHT,
          {
            enabled: isSnapEnabled,
            enabledX: nextPosition.lockedAxis !== 'vertical',
            enabledY: nextPosition.lockedAxis !== 'horizontal',
            threshold: DEFAULT_SNAP_THRESHOLD,
          },
        )
        const deltaX = snapResult.x - interaction.originDocument.layers
          .filter((layer) => interaction.selectedLayerIds.includes(layer.id))
          .reduce((minimumX, layer) => Math.min(minimumX, getLayerTransformBounds(layer).minX), Number.POSITIVE_INFINITY)
        const deltaY = snapResult.y - interaction.originDocument.layers
          .filter((layer) => interaction.selectedLayerIds.includes(layer.id))
          .reduce((minimumY, layer) => Math.min(minimumY, getLayerTransformBounds(layer).minY), Number.POSITIVE_INFINITY)

        interactionRef.current = {
          ...nextPosition.interaction,
          hasChanged: true,
        }
        setActiveMoveGuides(snapResult.guides)

        setTransient((currentDocument) => ({
          ...currentDocument,
          layers: currentDocument.layers.map((layer) => {
            const originalPosition = interaction.originalPositions[layer.id]

            if (!originalPosition) {
              return layer
            }

            return {
              ...layer,
              x: originalPosition.x + deltaX,
              y: originalPosition.y + deltaY,
            }
          }),
        }))
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

      if (interaction.type === 'resize-multi') {
        const deltaX = documentPoint.x - interaction.pointerStart.x
        const deltaY = documentPoint.y - interaction.pointerStart.y
        const startBounds = interaction.startBounds
        let nextX = startBounds.x
        let nextY = startBounds.y
        let nextWidth = startBounds.width
        let nextHeight = startBounds.height

        if (interaction.handle.x === 1) {
          nextWidth = Math.max(MIN_LAYER_WIDTH, startBounds.width + deltaX)
        }

        if (interaction.handle.x === -1) {
          nextWidth = Math.max(MIN_LAYER_WIDTH, startBounds.width - deltaX)
          nextX = startBounds.x + (startBounds.width - nextWidth)
        }

        if (interaction.handle.y === 1) {
          nextHeight = Math.max(MIN_LAYER_HEIGHT, startBounds.height + deltaY)
        }

        if (interaction.handle.y === -1) {
          nextHeight = Math.max(MIN_LAYER_HEIGHT, startBounds.height - deltaY)
          nextY = startBounds.y + (startBounds.height - nextHeight)
        }

        if (interaction.handle.x !== 0 && interaction.handle.y !== 0 && event.shiftKey) {
          const widthRatio = nextWidth / startBounds.width
          const heightRatio = nextHeight / startBounds.height
          const dominantRatio =
            Math.abs(widthRatio - 1) > Math.abs(heightRatio - 1) ? widthRatio : heightRatio
          nextWidth = Math.max(MIN_LAYER_WIDTH, startBounds.width * dominantRatio)
          nextHeight = Math.max(MIN_LAYER_HEIGHT, startBounds.height * dominantRatio)

          if (interaction.handle.x === -1) {
            nextX = startBounds.x + (startBounds.width - nextWidth)
          }

          if (interaction.handle.y === -1) {
            nextY = startBounds.y + (startBounds.height - nextHeight)
          }
        }

        const ratioX = nextWidth / Math.max(startBounds.width, 1)
        const ratioY = nextHeight / Math.max(startBounds.height, 1)

        interactionRef.current = {
          ...interaction,
          hasChanged: true,
        }

        setTransient((currentDocument) => ({
          ...currentDocument,
          layers: currentDocument.layers.map((layer) => {
            const originalState = interaction.originalLayerStates[layer.id]

            if (!originalState) {
              return layer
            }

            const relativeX = (originalState.x - startBounds.x) / Math.max(startBounds.width, 1)
            const relativeY = (originalState.y - startBounds.y) / Math.max(startBounds.height, 1)
            const scaledX = nextX + (relativeX * nextWidth)
            const scaledY = nextY + (relativeY * nextHeight)

            if (layer.type === 'text') {
              if (layer.mode === 'box') {
                const resizedLayer = resizeBoxText(
                  {
                    ...layer,
                    x: scaledX,
                    y: scaledY,
                  },
                  Math.max(MIN_LAYER_WIDTH, originalState.width * ratioX),
                  Math.max(MIN_LAYER_HEIGHT, originalState.height * ratioY),
                )

                return resizedLayer
              }

              return {
                ...resizePointTextTransform(
                  {
                    ...layer,
                    x: scaledX,
                    y: scaledY,
                  },
                  Math.max(0.1, originalState.scaleX * ratioX),
                  Math.max(0.1, originalState.scaleY * ratioY),
                ),
                width: layer.measuredWidth ?? layer.width,
                height: layer.measuredHeight ?? layer.height,
              }
            }

            return {
              ...layer,
              x: scaledX,
              y: scaledY,
              width: Math.max(MIN_LAYER_WIDTH, originalState.width * ratioX),
              height: Math.max(MIN_LAYER_HEIGHT, originalState.height * ratioY),
            }
          }),
        }))
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

      if (interaction.type === 'gradient') {
        const surfaceEntry = rasterSurfacesRef.current.get(interaction.sourceLayerId)
        const layerPoint = surfaceEntry?.offscreenCanvas && surfaceEntry.layerElement
          ? toLayerCoordinates(event, surfaceEntry.layerElement, surfaceEntry.offscreenCanvas)
          : null

        if (!layerPoint) {
          return
        }

        setGradientPreview({
          layerId: interaction.sourceLayerId,
          layer: interaction.sourceLayer,
          surfaceWidth: interaction.surfaceWidth,
          surfaceHeight: interaction.surfaceHeight,
          startPoint: interaction.startPoint,
          endPoint: layerPoint,
        })

        interactionRef.current = {
          ...interaction,
          endPoint: layerPoint,
          hasChanged: (
            Math.abs(layerPoint.x - interaction.startPoint.x) >= 0.5 ||
            Math.abs(layerPoint.y - interaction.startPoint.y) >= 0.5
          ),
        }
      }

      if (interaction.type === 'floating-selection-drag') {
        const nextPosition = applyAxisLockedMove(
          interaction,
          documentPoint,
          documentPoint.x - interaction.offsetX,
          documentPoint.y - interaction.offsetY,
          event.shiftKey,
        )

        setFloatingSelection((currentSelection) => {
          if (!currentSelection) {
            return currentSelection
          }

          return {
            ...currentSelection,
            x: nextPosition.x,
            y: nextPosition.y,
          }
        })

        interactionRef.current = {
          ...nextPosition.interaction,
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
              updateLayer(
                currentDocument,
                interaction.layerId,
                createImageLayerBitmapPatch(currentLayer, nextBitmap, {
                  x: nextX,
                  y: nextY,
                  width: nextWidth,
                  height: nextHeight,
                }),
              ),
            )
          }
        }

        setPenDrawingLayerId(null)
        setActiveSvgToolLayerId(null)
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
              const currentLayer = findLayer(documentState, interaction.layerId)

              commit((currentDocument) =>
                updateLayer(
                  currentDocument,
                  interaction.layerId,
                  createImageLayerBitmapPatch(currentLayer, nextBitmap),
                ),
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

        setActiveSvgToolLayerId(null)
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
        setActiveSvgToolLayerId(null)
        interactionRef.current = null

        if (nextSelection) {
          createFloatingSelectionFromLasso('move', nextSelection)
        }

        return
      }

      if (interaction?.type === 'gradient') {
        const surfaceEntry = rasterSurfacesRef.current.get(interaction.sourceLayerId)
        const sourceLayer = findLayer(documentState, interaction.sourceLayerId)

        if (
          interaction.hasChanged &&
          surfaceEntry?.offscreenCanvas &&
          sourceLayer &&
          interaction.restoreCanvas
        ) {
          const workingCanvas = cloneCanvas(interaction.restoreCanvas)
          const gradientEndColor = interaction.mode === 'bg-to-transparent'
            ? createTransparentColorFromHex(globalColors.background)
            : globalColors.foreground
          const gradientResult = gradientEndColor
            ? applyLinearGradientToCanvas(
              workingCanvas,
              interaction.startPoint,
              interaction.endPoint,
              globalColors.background,
              gradientEndColor,
              {
                restrictToVisiblePixels: isAlphaLocked(sourceLayer),
                preserveAlphaMask: isAlphaLocked(sourceLayer),
              },
            )
            : { changed: false }

          if (gradientResult.changed) {
            const nextBitmap = canvasToBitmap(workingCanvas)
            surfaceEntry.offscreenCanvas = workingCanvas
            drawRasterLayer(interaction.sourceLayerId)

            commit((currentDocument) => {
              const nextLayer = findLayer(currentDocument, interaction.sourceLayerId)

              if (!nextLayer || !canApplyGradientToLayer(nextLayer)) {
                return currentDocument
              }

              return updateLayer(
                currentDocument,
                interaction.sourceLayerId,
                createImageLayerBitmapPatch(nextLayer, nextBitmap),
              )
            })
          }
        }

        setGradientPreview(null)
        interactionRef.current = null
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
      setGradientPreview(null)
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
  }, [commit, commitTransientChange, documentState, drawRasterLayer, globalColors, isSnapEnabled, setTransient, viewport])

  useEffect(() => {
    function handleKeyDown(event) {
      if (isEditableTarget(event.target)) {
        return
      }

      const lowerKey = event.key.toLowerCase()
      const selectedDocumentLayer = findLayer(documentState, documentState.selectedLayerId)

      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        if (lowerKey === 'x') {
          event.preventDefault()
          swapColors()
          return
        }

        if (lowerKey === 'd') {
          event.preventDefault()
          resetColors()
          return
        }
      }

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
  }, [
    commit,
    deleteSelectedLassoRegion,
    deleteFloatingSelection,
    documentState,
    floatingSelection,
    lassoSelection,
    redo,
    undo,
    resetColors,
    swapColors,
  ])

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

      clearDocumentSelection()
    }

    window.addEventListener('pointerdown', handleDocumentPointerDown)

    return () => {
      window.removeEventListener('pointerdown', handleDocumentPointerDown)
    }
  }, [setTransient])

  function applyDocumentChange(updater) {
    commit((currentDocument) => updater(currentDocument))
  }

  const selectDocumentLayer = useCallback((layerId) => {
    setTransient((currentDocument) => {
      const nextLayerId = layerId ?? getFallbackSelectedLayerId(currentDocument, currentDocument.selectedLayerId)
      return selectSingleLayer(currentDocument, nextLayerId)
    })
  }, [setTransient])

  const toggleDocumentLayerSelection = useCallback((layerId) => {
    setTransient((currentDocument) => toggleLayerInSelection(currentDocument, layerId))
  }, [setTransient])

  const clearDocumentSelection = useCallback(() => {
    setTransient((currentDocument) => {
      const fallbackSelectedLayerId = getFallbackSelectedLayerId(
        currentDocument,
        currentDocument.selectedLayerId,
      )

      if (!fallbackSelectedLayerId) {
        return clearSelection(currentDocument)
      }

      return selectSingleLayer(currentDocument, fallbackSelectedLayerId)
    })
  }, [setTransient])

  function addLayer(factory) {
    const nextLayer = factory()
    applyDocumentChange((currentDocument) => appendLayer(currentDocument, nextLayer))

    if (nextLayer.type === 'text') {
      setActiveTool('select')
    }
  }

  function resolvePenLayer(targetLayer) {
    const selectedDocumentLayer = findLayer(documentState, documentState.selectedLayerId)

    if (isSvgImageLayer(targetLayer)) {
      const nextLayer = createRasterLayer({
        name: `${targetLayer.name} Paint`,
      })

      lastPenEditableLayerIdRef.current = nextLayer.id
      commit((currentDocument) => insertLayer(currentDocument, nextLayer, targetLayer.id))
      return nextLayer
    }

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

  const resetEditorRuntimeState = useCallback(() => {
    interactionRef.current = null
    rasterSurfacesRef.current = new Map()
    copiedLayerRef.current = null
    lastPenEditableLayerIdRef.current = null
    setEditingTextLayerId(null)
    setTextDraft('')
    setActiveTool('select')
    setPenDrawingLayerId(null)
    setLassoSelection(null)
    setFloatingSelection(null)
    setDraggedLayerId(null)
    setLayerDropTarget(null)
    setAssetLibrary([])
    setDraggedAssetId(null)
    setActiveSvgToolLayerId(null)
    setIsCanvasAssetDropActive(false)
    setActiveMoveGuides(createEmptySnapGuides())
    setViewport({
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    })
  }, [])

  const loadDocumentState = useCallback((nextDocumentState) => {
    resetEditorRuntimeState()
    reset(normalizeDocumentState(nextDocumentState))
  }, [reset, resetEditorRuntimeState])

  function handleNewFile() {
    setIsFileMenuOpen(false)
    loadDocumentState(createInitialDocument())
  }

  function handleSaveFile() {
    setIsFileMenuOpen(false)
    downloadProjectFile(documentState)
  }

  function handleOpenFileClick() {
    setIsFileMenuOpen(false)
    openFileInputRef.current?.click()
  }

  async function handleOpenFile(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setIsOpeningFile(true)

    try {
      const fileContents = await file.text()
      const loadedDocument = parseProjectFile(fileContents)
      loadDocumentState(loadedDocument)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'This project file could not be opened.')
    } finally {
      event.target.value = ''
      setIsOpeningFile(false)
    }
  }

  async function handleExport(format) {
    if (isExporting) {
      return
    }

    setIsFileMenuOpen(false)
    setIsExporting(true)

    try {
      await exportDocumentImage(
        documentState,
        DOCUMENT_WIDTH,
        DOCUMENT_HEIGHT,
        format,
      )
    } catch {
      // Ignore failed exports for the MVP.
    } finally {
      setIsExporting(false)
    }
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
      const sourceKind = getImportedSourceKind(file, imageDataUrl)
      const { width, height } = await loadImageDimensionsFromSource(imageDataUrl)
      const dimensions = getImportedImageDimensions(width, height)
      const position = getDefaultImportedImagePosition(dimensions.width, dimensions.height)

      addLayer(() =>
        createImageLayer({
          x: position.x,
          y: position.y,
          width: dimensions.width,
          height: dimensions.height,
          name: file.name.replace(/\.[^.]+$/, '') || 'Imported Image',
          src: imageDataUrl,
          bitmap: imageDataUrl,
          sourceKind,
          fit: 'fill',
        }),
      )
      setActiveTool('select')
    } catch {
      // Ignore failed imports for the MVP.
    }

    resetInput()
  }

  async function handleAssetLibraryImport(event) {
    const files = event.target.files

    if (!files?.length) {
      return
    }

    try {
      const nextAssets = await importAssetsFromFiles(files)
      setAssetLibrary((currentAssets) => [...currentAssets, ...nextAssets])
    } finally {
      event.target.value = ''
    }
  }

  async function createImageLayerFromAsset(asset, x, y) {
    let width = MIN_LAYER_WIDTH
    let height = MIN_LAYER_HEIGHT

    try {
      const dimensions = await loadImageDimensionsFromSource(asset.src)
      const naturalDimensions = getImportedImageDimensions(dimensions.width, dimensions.height)
      width = naturalDimensions.width
      height = naturalDimensions.height
    } catch {
      const fallbackDimensions = getImportedImageDimensions(
        asset.width ?? 240,
        asset.height ?? 240,
      )
      width = fallbackDimensions.width
      height = fallbackDimensions.height
    }

    const position = clampImportedImagePosition(
      Math.round(x - (width / 2)),
      Math.round(y - (height / 2)),
      width,
      height,
    )

    return createImageLayer({
      x: position.x,
      y: position.y,
      width,
      height,
      name: asset.name,
      src: asset.src,
      bitmap: asset.src,
      sourceKind: asset.sourceKind ?? inferImageSourceKindFromSrc(asset.src),
      fit: 'fill',
    })
  }

  function handleAssetDragStart(event, asset) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(ASSET_DRAG_MIME_TYPE, asset.id)
    setDraggedAssetId(asset.id)
  }

  function handleAssetDragEnd() {
    setDraggedAssetId(null)
    setIsCanvasAssetDropActive(false)
  }

  function removeAssetFromLibrary(assetId) {
    setAssetLibrary((currentAssets) => currentAssets.filter((asset) => asset.id !== assetId))

    if (draggedAssetId === assetId) {
      setDraggedAssetId(null)
    }
  }

  function handleCanvasAssetDragOver(event) {
    if (!event.dataTransfer.types.includes(ASSET_DRAG_MIME_TYPE)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'

    if (!isCanvasAssetDropActive) {
      setIsCanvasAssetDropActive(true)
    }
  }

  async function handleCanvasAssetDrop(event) {
    const assetId = event.dataTransfer.getData(ASSET_DRAG_MIME_TYPE)

    if (!assetId) {
      return
    }

    event.preventDefault()
    setIsCanvasAssetDropActive(false)
    setDraggedAssetId(null)

    const asset = assetLibrary.find((candidate) => candidate.id === assetId)
    const dropPoint = toDocumentCoordinates(event, canvasRef.current, viewport)

    if (!asset || !dropPoint) {
      return
    }

    const nextLayer = await createImageLayerFromAsset(asset, dropPoint.x, dropPoint.y)
    applyDocumentChange((currentDocument) => appendLayer(currentDocument, nextLayer))
  }

  function updateSelectedLayer(patch) {
    if (!selectedLayer || selectedLayerIds.length !== 1) {
      return
    }

    applyDocumentChange((currentDocument) =>
      updateLayer(currentDocument, selectedLayer.id, patch),
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

  function getActiveLassoLayer() {
    if (selectedLayerIds.length !== 1 || !selectedLayer || !isRasterLayer(selectedLayer)) {
      return null
    }

    return selectedLayer
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

    if (!documentPoint) {
      return
    }

    const activeSelection = isLayerSelected(documentState, layer.id)
      ? selectedLayers
      : [layer]

    if (activeSelection.length > 1) {
      const bounds = getSelectionBoundsFromLayers(activeSelection)

      if (!bounds) {
        return
      }

      interactionRef.current = {
        type: 'move-multi',
        selectedLayerIds: activeSelection.map((selectedLayer) => selectedLayer.id),
        offsetX: documentPoint.x - bounds.x,
        offsetY: documentPoint.y - bounds.y,
        frameWidth: bounds.width,
        frameHeight: bounds.height,
        originalPositions: Object.fromEntries(activeSelection.map((selectedLayer) => [
          selectedLayer.id,
          { x: selectedLayer.x, y: selectedLayer.y },
        ])),
        originDocument: documentState,
        hasChanged: false,
        ...createMoveAxisLockState(),
      }
      return
    }

    const { width, height } = getFrameDimensions(layer)
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
      ...createMoveAxisLockState(),
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

    if (!documentPoint) {
      return
    }

    const activeSelection = isLayerSelected(documentState, layer.id)
      ? selectedLayers
      : [layer]

    if (activeSelection.length > 1) {
      const bounds = getSelectionBoundsFromLayers(activeSelection)

      if (!bounds) {
        return
      }

      interactionRef.current = {
        type: 'resize-multi',
        selectedLayerIds: activeSelection.map((selectedLayer) => selectedLayer.id),
        handle,
        pointerStart: {
          x: documentPoint.x,
          y: documentPoint.y,
        },
        startBounds: bounds,
        originalLayerStates: Object.fromEntries(activeSelection.map((selectedLayer) => [
          selectedLayer.id,
          {
            x: selectedLayer.x,
            y: selectedLayer.y,
            width: selectedLayer.width,
            height: selectedLayer.height,
            scaleX: selectedLayer.scaleX,
            scaleY: selectedLayer.scaleY,
            type: selectedLayer.type,
            mode: selectedLayer.mode,
            measuredWidth: selectedLayer.measuredWidth,
            measuredHeight: selectedLayer.measuredHeight,
            boxWidth: selectedLayer.boxWidth,
            boxHeight: selectedLayer.boxHeight,
          },
        ])),
        originDocument: documentState,
        hasChanged: false,
      }
      return
    }

    const { width, height } = getFrameDimensions(layer)
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
    setActiveSvgToolLayerId(
      penLayer.type === 'image' && penLayer.sourceKind === 'svg' ? penLayer.id : null,
    )

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
      color: globalColors.foreground,
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
    setActiveSvgToolLayerId(
      layer.type === 'image' && layer.sourceKind === 'svg' ? layer.id : null,
    )

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

  async function beginBucketFill(event, layer) {
    event.stopPropagation()
    event.preventDefault()

    if (!canFillLayerWithBucket(layer)) {
      return
    }

    selectDocumentLayer(layer.id)

    const surfaceCanvas = await ensureRasterLayerSurface(layer)
    const surfaceEntry = rasterSurfacesRef.current.get(layer.id)
    const layerPoint = surfaceCanvas && surfaceEntry?.layerElement
      ? toLayerCoordinates(event, surfaceEntry.layerElement, surfaceCanvas)
      : null

    if (!surfaceCanvas || !surfaceEntry || !layerPoint) {
      return
    }

    const workingCanvas = cloneCanvas(surfaceCanvas)
    const fillResult = floodFillCanvas(
      workingCanvas,
      layerPoint.x,
      layerPoint.y,
      globalColors.foreground,
      bucketTolerance,
      {
        preserveAlpha: isAlphaLocked(layer),
        restrictToVisiblePixels: isAlphaLocked(layer),
      },
    )

    if (!fillResult.changed) {
      return
    }

    surfaceEntry.offscreenCanvas = workingCanvas
    drawRasterLayer(layer.id)

    const nextBitmap = canvasToBitmap(workingCanvas)

    commit((currentDocument) => {
      const currentLayer = findLayer(currentDocument, layer.id)

      if (!currentLayer || !canFillLayerWithBucket(currentLayer)) {
        return currentDocument
      }

      return updateLayer(
        currentDocument,
        layer.id,
        createImageLayerBitmapPatch(currentLayer, nextBitmap),
      )
    })
  }

  async function beginGradient(event, layer) {
    event.stopPropagation()
    event.preventDefault()

    if (!canApplyGradientToLayer(layer)) {
      return
    }

    selectDocumentLayer(layer.id)

    const surfaceCanvas = await ensureRasterLayerSurface(layer)
    const surfaceEntry = rasterSurfacesRef.current.get(layer.id)
    const startPoint = surfaceCanvas && surfaceEntry?.layerElement
      ? toLayerCoordinates(event, surfaceEntry.layerElement, surfaceCanvas)
      : null

    if (!surfaceCanvas || !surfaceEntry || !startPoint) {
      return
    }

    setGradientPreview({
      layerId: layer.id,
      layer: {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
        scaleX: layer.scaleX,
        scaleY: layer.scaleY,
      },
      surfaceWidth: surfaceCanvas.width,
      surfaceHeight: surfaceCanvas.height,
      startPoint,
      endPoint: startPoint,
    })

    interactionRef.current = {
      type: 'gradient',
      sourceLayerId: layer.id,
      sourceLayer: {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
        scaleX: layer.scaleX,
        scaleY: layer.scaleY,
      },
      surfaceWidth: surfaceCanvas.width,
      surfaceHeight: surfaceCanvas.height,
      startPoint,
      endPoint: startPoint,
      mode: gradientMode,
      restoreCanvas: cloneCanvas(surfaceCanvas),
      hasChanged: false,
    }
  }

  async function beginLasso(event, layer) {
    event.stopPropagation()
    event.preventDefault()

    if (!isRasterLayer(layer)) {
      return
    }

    setActiveSvgToolLayerId(
      layer.type === 'image' && layer.sourceKind === 'svg' ? layer.id : null,
    )

    const surfaceCanvas = await ensureRasterLayerSurface(layer)
    const surfaceEntry = rasterSurfacesRef.current.get(layer.id)
    const layerPoint = surfaceCanvas && surfaceEntry?.layerElement
      ? toLayerCoordinates(event, surfaceEntry.layerElement, surfaceCanvas)
      : null

    if (!surfaceCanvas || !surfaceEntry || !layerPoint) {
      return
    }

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
      ...createMoveAxisLockState(),
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
      updateLayer(
        currentDocument,
        sourceLayer.id,
        createImageLayerBitmapPatch(sourceLayer, canvasToBitmap(targetCanvas), {
          x: nextLayerX,
          y: nextLayerY,
          width: nextLayerWidth,
          height: nextLayerHeight,
        }),
      ),
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
          ? updateLayer(
            currentDocument,
            sourceLayer.id,
            createImageLayerBitmapPatch(
              sourceLayer,
              canvasToBitmap(sourceEntry.offscreenCanvas),
            ),
          )
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
        updateLayer(
          currentDocument,
          sourceLayer.id,
          createImageLayerBitmapPatch(
            sourceLayer,
            canvasToBitmap(sourceEntry.offscreenCanvas),
          ),
        ),
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
      updateLayer(
        currentDocument,
        sourceLayer.id,
        createImageLayerBitmapPatch(sourceLayer, canvasToBitmap(workingCanvas)),
      ),
    )

    setLassoSelection(null)
  }

  function handleLayerPointerDown(event, layer) {
    if (currentTool === 'select' && event.shiftKey) {
      event.stopPropagation()
      event.preventDefault()
      toggleDocumentLayerSelection(layer.id)
      return
    }

    if (currentTool === 'zoom') {
      handleZoomPointer(event)
      return
    }

    if (currentTool === 'lasso') {
      event.stopPropagation()
      event.preventDefault()

      const lassoLayer = getActiveLassoLayer()

      if (!lassoLayer || lassoLayer.id !== layer.id) {
        return
      }

      if (beginFloatingSelectionDrag(event)) {
        return
      }

      if (floatingSelection) {
        void commitFloatingSelectionToLayer(false)
        return
      }

      if (lassoSelection?.sourceLayerId === lassoLayer.id) {
        const surfaceEntry = rasterSurfacesRef.current.get(lassoLayer.id)
        const surfaceCanvas = surfaceEntry?.offscreenCanvas
        const layerPoint = surfaceCanvas && surfaceEntry?.layerElement
          ? toLayerCoordinates(event, surfaceEntry.layerElement, surfaceCanvas)
          : null

        if (layerPoint && !isPointInsidePolygon(layerPoint, lassoSelection.points)) {
          setLassoSelection(null)
        }
      }

      beginLasso(event, lassoLayer)
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

    if (currentTool === 'bucket') {
      void beginBucketFill(event, layer)
      return
    }

    if (currentTool === 'gradient') {
      void beginGradient(event, layer)
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
      }

      return
    }

    if (currentTool === 'pen') {
      if (!documentState.layers.length) {
        beginPenStroke(event, null)
      } else if (selectedLayer?.type === 'raster') {
        beginPenStroke(event, selectedLayer)
      }
      return
    }

    if (!(event.target instanceof HTMLElement) || !event.target.closest('.canvas-layer')) {
      if (!event.shiftKey) {
        clearDocumentSelection()
      }
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

    const shouldZoomOut = event.button === 2 || event.altKey
    const zoomFactor = shouldZoomOut ? 1 / VIEWPORT_ZOOM_STEP : VIEWPORT_ZOOM_STEP

    setViewport((currentViewport) => {
      const nextViewport = zoomAtPoint(
        {
          ...currentViewport,
          zoom: currentViewport.zoom * BASE_DOCUMENT_SCALE,
        },
        pointerPosition.x,
        pointerPosition.y,
        zoomFactor,
        MIN_VIEWPORT_ZOOM * BASE_DOCUMENT_SCALE,
        MAX_VIEWPORT_ZOOM * BASE_DOCUMENT_SCALE,
      )

      return {
        zoom: nextViewport.zoom / BASE_DOCUMENT_SCALE,
        offsetX: nextViewport.offsetX,
        offsetY: nextViewport.offsetY,
      }
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

    const isSelected = isLayerSelected(documentState, layer.id)
    const isEditingText = layer.type === 'text' && layer.id === editingTextLayerId
    const showEraserCursor = currentTool === 'eraser' && isErasableLayer(layer)
    const showBucketCursor = currentTool === 'bucket' && canFillLayerWithBucket(layer)
    const showGradientCursor = currentTool === 'gradient' && canApplyGradientToLayer(layer)
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
            : showBucketCursor
              ? 'canvas-layer bucket-enabled'
              : showGradientCursor
                ? 'canvas-layer gradient-enabled'
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
        {layer.type === 'image' &&
        layer.sourceKind === 'svg' &&
        activeSvgToolLayerId !== layer.id ? (
          <div className="layer-body image-layer-body">
            <img
              className="layer-image"
              src={layer.src}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </div>
        ) : isRasterLayer(layer) && (
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

        {isSelected && currentTool === 'select' && !hasMultiSelection && (
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
        {isSelected && currentTool === 'select' && hasMultiSelection && (
          <div className="selection-frame passive" aria-hidden="true" />
        )}
      </div>
    )
  }

  function renderSharedSelectionOverlay() {
    if (currentTool !== 'select' || !selectionBounds || selectedLayers.length === 0) {
      return null
    }

    if (!hasMultiSelection) {
      return null
    }

    const primaryLayer = selectedLayer ?? selectedLayers.at(-1)

    if (!primaryLayer) {
      return null
    }

    return (
      <div
        className="shared-selection-frame"
        style={{
          left: `${selectionBounds.x}px`,
          top: `${selectionBounds.y}px`,
          width: `${selectionBounds.width}px`,
          height: `${selectionBounds.height}px`,
        }}
        onPointerDown={(event) => startMove(event, primaryLayer)}
        aria-hidden="true"
      >
        {HANDLE_DIRECTIONS.map((handle) => (
          <button
            key={handle.key}
            className={`resize-handle handle-${handle.key}`}
            type="button"
            onPointerDown={(event) => startResize(event, primaryLayer, handle)}
          />
        ))}
      </div>
    )
  }

  return (
    <main className="app-shell">
      <input
        ref={openFileInputRef}
        className="sr-only"
        type="file"
        accept=".kryop,application/json"
        onChange={(event) => {
          void handleOpenFile(event)
        }}
      />
      <div ref={fileMenuRef} className="app-file-menu">
        <button
          className={isFileMenuOpen ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => setIsFileMenuOpen((currentValue) => !currentValue)}
          aria-expanded={isFileMenuOpen}
          aria-haspopup="menu"
        >
          File
        </button>
        {isFileMenuOpen && (
          <div className="topbar-menu-dropdown" role="menu" aria-label="File">
            <button
              className="topbar-menu-item"
              type="button"
              onClick={handleNewFile}
              role="menuitem"
            >
              New File
            </button>
            <button
              className="topbar-menu-item"
              type="button"
              onClick={handleOpenFileClick}
              disabled={isOpeningFile}
              role="menuitem"
            >
              Open File
            </button>
            <button
              className="topbar-menu-item"
              type="button"
              onClick={handleSaveFile}
              role="menuitem"
            >
              Save File
            </button>
            <button
              className="topbar-menu-item"
              type="button"
              onClick={() => void handleExport('png')}
              disabled={isExporting}
              role="menuitem"
            >
              Export PNG
            </button>
            <button
              className="topbar-menu-item"
              type="button"
              onClick={() => void handleExport('jpeg')}
              disabled={isExporting}
              role="menuitem"
            >
              Export JPEG
            </button>
          </div>
        )}
      </div>
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
              <img className="button-icon" src={pointerIcon} alt="" aria-hidden="true" />
            </button>
            <button
              className={currentTool === 'pen' ? 'action-button active' : 'action-button'}
              type="button"
              onClick={() => setActiveTool('pen')}
              aria-label="Pen"
            >
              <img className="button-icon" src={penIcon} alt="" aria-hidden="true" />
            </button>
            <button
              className={currentTool === 'eraser' ? 'action-button active' : 'action-button'}
              type="button"
              onClick={() => setActiveTool('eraser')}
              aria-label="Eraser"
            >
              <img className="button-icon" src={eraserIcon} alt="" aria-hidden="true" />
            </button>
            <button
              className={currentTool === 'bucket' ? 'action-button active' : 'action-button'}
              type="button"
              onClick={() => setActiveTool('bucket')}
              aria-label="Bucket Fill"
            >
              <img className="button-icon" src={bucketIcon} alt="" aria-hidden="true" />
            </button>
            <button
              className={currentTool === 'gradient' ? 'action-button active' : 'action-button'}
              type="button"
              onClick={() => setActiveTool('gradient')}
              aria-label="Gradient"
            >
              <img className="button-icon" src={gradientIcon} alt="" aria-hidden="true" />
            </button>
            <button
              className={currentTool === 'lasso' ? 'action-button active' : 'action-button'}
              type="button"
              onClick={() => setActiveTool('lasso')}
              aria-label="Lasso"
            >
              <img className="button-icon" src={lassoIcon} alt="" aria-hidden="true" />
            </button>
            <button
              className={currentTool === 'zoom' ? 'action-button active' : 'action-button'}
              type="button"
              onClick={() => setActiveTool('zoom')}
              onDoubleClick={() => setViewport({ zoom: 1, offsetX: 0, offsetY: 0 })}
              aria-label="Zoom"
            >
              <img className="button-icon" src={zoomIcon} alt="" aria-hidden="true" />
            </button>
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
                <label className="toolbar-range">
                  <span>{activeBrushTool === 'pen' ? 'Brush' : 'Eraser'}</span>
                  <input
                    type="range"
                    min={activeBrushTool === 'pen' ? '2' : '8'}
                    max={activeBrushTool === 'pen' ? '120' : '96'}
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
            {currentTool === 'bucket' && (
              <label className="toolbar-range">
                <span>Tolerance</span>
                <input
                  type="range"
                  min="0"
                  max="255"
                  step="1"
                  value={bucketTolerance}
                  onChange={(event) => setBucketTolerance(Number(event.target.value))}
                />
                <strong>{bucketTolerance}</strong>
              </label>
            )}
            {currentTool === 'gradient' && (
              <label className="toolbar-range">
                <span>Mode</span>
                <select
                  className="toolbar-select"
                  value={gradientMode}
                  onChange={(event) => setGradientMode(event.target.value)}
                >
                  <option value="bg-to-fg">BG -&gt; FG</option>
                  <option value="bg-to-transparent">BG -&gt; Transparent</option>
                </select>
              </label>
            )}
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
            <div className="color-swatch-panel" aria-label="Global colors">
              <div className="color-swatch-stack">
                <label
                  className="color-swatch color-swatch-background"
                  aria-label={`Background color ${globalColors.background}`}
                  style={{ backgroundColor: globalColors.background }}
                >
                  <input
                    className="color-swatch-input"
                    type="color"
                    value={globalColors.background}
                    onChange={(event) => setBackground(event.target.value)}
                    aria-label="Set background color"
                  />
                </label>
                <label
                  className="color-swatch color-swatch-foreground"
                  aria-label={`Foreground color ${globalColors.foreground}`}
                  style={{ backgroundColor: globalColors.foreground }}
                >
                  <input
                    className="color-swatch-input"
                    type="color"
                    value={globalColors.foreground}
                    onChange={(event) => setForeground(event.target.value)}
                    aria-label="Set foreground color"
                  />
                </label>
              </div>
              <div className="color-swatch-actions">
                <button
                  className="icon-button"
                  type="button"
                  onClick={swapColors}
                  aria-label="Swap foreground and background colors"
                >
                  Swap
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={resetColors}
                  aria-label="Reset foreground and background colors"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="workspace-grid">
          <aside className="asset-sidebar">
            <input
              ref={assetLibraryInputRef}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
              multiple
              onChange={handleAssetLibraryImport}
            />
            <section className="panel-card asset-panel">
              <div className="asset-panel-header">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Assets</p>
                    <h2>Library</h2>
                  </div>
                  <button
                    className="action-button"
                    type="button"
                    onClick={() => assetLibraryInputRef.current?.click()}
                  >
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
                      <button
                        key={asset.id}
                        className={draggedAssetId === asset.id ? 'asset-card dragging' : 'asset-card'}
                        type="button"
                        draggable
                        onDragStart={(event) => handleAssetDragStart(event, asset)}
                        onDragEnd={handleAssetDragEnd}
                      >
                        <img className="asset-thumbnail" src={asset.src} alt="" aria-hidden="true" />
                        <div className="asset-card-footer">
                          <span className="asset-name">{asset.name}</span>
                          <button
                            className="asset-delete-button"
                            type="button"
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              removeAssetFromLibrary(asset.id)
                            }}
                            onPointerDown={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                            }}
                            aria-label={`Delete ${asset.name} from asset library`}
                          >
                            <img className="button-icon" src={closeIcon} alt="" aria-hidden="true" />
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </aside>

          <div className="workspace-main-column">
            <section className="canvas-panel">
              <div
                ref={canvasRef}
                className={isCanvasAssetDropActive ? 'canvas-stage asset-drop-active' : 'canvas-stage'}
                onPointerDown={handleCanvasPointerDown}
                onDragOver={handleCanvasAssetDragOver}
                onDragLeave={() => setIsCanvasAssetDropActive(false)}
                onDrop={(event) => {
                  void handleCanvasAssetDrop(event)
                }}
                onContextMenu={(event) => {
                  if (currentTool === 'zoom') {
                    event.preventDefault()
                  }
                }}
                role="presentation"
              >
                <div
                  className="canvas-viewport"
                  style={{
                    transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.zoom * BASE_DOCUMENT_SCALE})`,
                  }}
                >
                  <div ref={canvasSurfaceRef} className="canvas-surface">
                    {documentState.layers.map(renderLayer)}
                    {renderSharedSelectionOverlay()}
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
                  const isSelected = isLayerSelected(documentState, layer.id)
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
                      onClick={(event) => {
                        if (event.shiftKey) {
                          toggleDocumentLayerSelection(layer.id)
                          return
                        }

                        selectDocumentLayer(layer.id)
                      }}
                      onDragStart={(event) => handleLayerDragStart(event, layer.id)}
                      onDragOver={(event) => handleLayerDragOver(event, layer.id)}
                      onDrop={(event) => handleLayerDrop(event, layer.id, actualIndex)}
                      onDragEnd={handleLayerDragEnd}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          if (event.shiftKey) {
                            toggleDocumentLayerSelection(layer.id)
                            return
                          }

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
                          <img className="button-icon" src={duplicateIcon} alt="" aria-hidden="true" />
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

                {hasMultiSelection ? (
                  <div className="group-note full-width">
                    {selectedLayerIds.length} layers selected. Multi-selection currently supports
                    shared move and scale. Inspector editing remains single-layer only for now.
                  </div>
                ) : selectedLayer ? (
                  <div className="property-grid">
                    {selectedLayer.type === 'text' && (
                      <>
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
                                sourceKind: inferImageSourceKindFromSrc(event.target.value),
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
