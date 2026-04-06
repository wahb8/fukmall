import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import addImageIcon from './assets/add image.svg'
import addLayerIcon from './assets/add layer.svg'
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
  extractSelectionToCanvas,
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
  DEFAULT_DOCUMENT_NAME,
  DEFAULT_DOCUMENT_HEIGHT,
  DEFAULT_DOCUMENT_WIDTH,
  createImageLayer,
  createRasterLayer,
  createTextShadowLayer,
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
  linkLayerPair,
  mergeLayerDown,
  moveLayer,
  moveLayerToIndex,
  removeLayer,
  removeLayers,
  selectSingleLayer,
  setLayerAlphaLock,
  toggleLayerInSelection,
  unlinkLayerPair,
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
  createCanvasFromSource,
  createTransparentCanvas,
  createMaskCanvasFromSource,
  createEmptyMaskCanvas,
  floodFillCanvas,
  inferImageSourceKindFromSrc,
  loadImageDimensionsFromSource,
  paintCanvas,
  readFileAsDataUrl,
  renderTextLayerToCanvas,
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
import {
  downloadProjectFile,
  normalizeDocumentState,
  parseProjectFile,
  serializeProjectFile,
} from './lib/documentFiles'

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
const MAX_LAYER_SIZE = 5000
const DEFAULT_ERASER_SIZE = 28
const DEFAULT_PEN_SIZE = 16
const DEFAULT_BUCKET_TOLERANCE = 200
const MIN_DOCUMENT_DIMENSION = 1
const DISPLAY_DOCUMENT_WIDTH = 428
const TOOL_PANEL_ERROR_DURATION_MS = 4000
const TOOL_PANEL_ERROR_FADE_DELAY_MS = 3200
const MIN_VIEWPORT_ZOOM = 0.1
const MAX_VIEWPORT_ZOOM = 8
const VIEWPORT_ZOOM_STEP = 1.25
const ASSET_DRAG_MIME_TYPE = 'application/x-fukmall-asset-id'
const NO_LAYERS_TOOL_ERROR_MESSAGE = 'There are no layers to edit. Add a layer first.'

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
  const centerX = layer.x + (layer.width / 2)
  const centerY = layer.y + (layer.height / 2)
  const angle = (layer.rotation * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const halfWidth = layer.width / 2
  const halfHeight = layer.height / 2
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((point) => {
    const scaledX = point.x * layer.scaleX
    const scaledY = point.y * layer.scaleY

    return {
      x: centerX + (scaledX * cosine) - (scaledY * sine),
      y: centerY + (scaledX * sine) + (scaledY * cosine),
    }
  })

  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y)),
  }
}

function toLayerLocalPoint(layer, documentPoint) {
  if (!layer || !documentPoint) {
    return null
  }

  const scaleX = layer.scaleX
  const scaleY = layer.scaleY

  if (
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    Math.abs(scaleX) < 0.0001 ||
    Math.abs(scaleY) < 0.0001
  ) {
    return null
  }

  const angle = (layer.rotation * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const centerX = layer.x + (layer.width / 2)
  const centerY = layer.y + (layer.height / 2)
  const deltaX = documentPoint.x - centerX
  const deltaY = documentPoint.y - centerY
  const scaledX = (deltaX * cosine) + (deltaY * sine)
  const scaledY = (-deltaX * sine) + (deltaY * cosine)

  return {
    x: (scaledX / scaleX) + (layer.width / 2),
    y: (scaledY / scaleY) + (layer.height / 2),
  }
}

function isPointInsideLayerFrame(layer, localPoint) {
  if (!layer || !localPoint) {
    return false
  }

  return (
    localPoint.x >= 0 &&
    localPoint.y >= 0 &&
    localPoint.x <= layer.width &&
    localPoint.y <= layer.height
  )
}

function isPointInsideRoundedRect(width, height, radius, point) {
  if (!point) {
    return false
  }

  if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) {
    return false
  }

  const nextRadius = Math.max(0, Math.min(radius, width / 2, height / 2))

  if (nextRadius <= 0) {
    return true
  }

  if (
    (point.x >= nextRadius && point.x <= width - nextRadius) ||
    (point.y >= nextRadius && point.y <= height - nextRadius)
  ) {
    return true
  }

  const cornerCenterX = point.x < nextRadius ? nextRadius : width - nextRadius
  const cornerCenterY = point.y < nextRadius ? nextRadius : height - nextRadius
  const deltaX = point.x - cornerCenterX
  const deltaY = point.y - cornerCenterY

  return ((deltaX * deltaX) + (deltaY * deltaY)) <= (nextRadius * nextRadius)
}

function getMergedLayerBounds(...layers) {
  const bounds = layers.map((layer) => getLayerTransformBounds(layer))
  const minX = Math.min(...bounds.map((bound) => bound.minX))
  const minY = Math.min(...bounds.map((bound) => bound.minY))
  const maxX = Math.max(...bounds.map((bound) => bound.maxX))
  const maxY = Math.max(...bounds.map((bound) => bound.maxY))

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, Math.ceil(maxX - minX)),
    height: Math.max(1, Math.ceil(maxY - minY)),
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

function clampValue(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function createInitialDocument(
  width = DEFAULT_DOCUMENT_WIDTH,
  height = DEFAULT_DOCUMENT_HEIGHT,
  name = DEFAULT_DOCUMENT_NAME,
) {
  const scaleX = width / DEFAULT_DOCUMENT_WIDTH
  const scaleY = height / DEFAULT_DOCUMENT_HEIGHT
  const whiteBackground = createShapeLayer({
    name: 'Background',
    x: 0,
    y: 0,
    width,
    height,
    fill: '#ffffff',
    radius: 0,
  })
  const background = createImageLayer({
    name: 'Hero Image',
    x: Math.round(76 * scaleX),
    y: Math.round(62 * scaleY),
    width: Math.max(MIN_LAYER_WIDTH, Math.round(360 * scaleX)),
    height: Math.max(MIN_LAYER_HEIGHT, Math.round(260 * scaleY)),
    src: heroImage,
    bitmap: heroImage,
  })
  const card = createShapeLayer({
    name: 'Color Block',
    x: Math.round(340 * scaleX),
    y: Math.round(120 * scaleY),
    width: Math.max(MIN_LAYER_WIDTH, Math.round(220 * scaleX)),
    height: Math.max(MIN_LAYER_HEIGHT, Math.round(220 * scaleY)),
    fill: '#f97316',
    radius: 34,
  })
  const title = createTextLayer({
    name: 'Headline',
    x: Math.round(126 * scaleX),
    y: Math.round(114 * scaleY),
    width: Math.max(MIN_LAYER_WIDTH, Math.round(300 * scaleX)),
    height: Math.max(MIN_LAYER_HEIGHT, Math.round(120 * scaleY)),
    text: 'A cleaner\nlayer stack',
    fontSize: Math.max(8, Math.round(40 * Math.min(scaleX, scaleY))),
  })

  return createDocument(
    [whiteBackground, background, card, title],
    background.id,
    width,
    height,
    name,
  )
}

function normalizeNewFileDimensionInput(value, fallback) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.max(MIN_DOCUMENT_DIMENSION, Math.round(numericValue))
}

function normalizeNewFileNameInput(value, fallback = DEFAULT_DOCUMENT_NAME) {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmedValue = value.trim()

  return trimmedValue || fallback
}

function getDocumentFilenameBase(name, fallback) {
  const normalizedName = normalizeNewFileNameInput(name, fallback)
  const sanitizedName = normalizedName
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .filter((character) => {
      const codePoint = character.charCodeAt(0)

      return codePoint >= 32
    })
    .join('')
    .trim()

  return sanitizedName || fallback
}

function getImportedImageDimensions(width, height) {
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
}

function clampImportedImagePosition(x, y, width, height, documentWidth, documentHeight) {
  const maxX = documentWidth - width
  const maxY = documentHeight - height

  return {
    x: maxX >= 0 ? Math.min(Math.max(0, x), maxX) : 0,
    y: maxY >= 0 ? Math.min(Math.max(0, y), maxY) : 0,
  }
}

function getDefaultImportedImagePosition(width, height, documentWidth, documentHeight) {
  return clampImportedImagePosition(
    Math.round((documentWidth - width) / 2),
    Math.round((documentHeight - height) / 2),
    width,
    height,
    documentWidth,
    documentHeight,
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

function createBitmapEditableLayerPatch(layer, bitmap, overrides = {}) {
  if (layer?.type === 'shape') {
    return {
      ...layer,
      type: 'image',
      src: bitmap,
      bitmap,
      sourceKind: 'bitmap',
      fit: 'fill',
      ...overrides,
    }
  }

  return createImageLayerBitmapPatch(layer, bitmap, overrides)
}

function shouldLocalizeEmptyRasterLayerForPen(layer, documentWidth, documentHeight) {
  return Boolean(layer) && layer.type === 'raster' && !layer.bitmap &&
    layer.x === 0 &&
    layer.y === 0 &&
    layer.width === documentWidth &&
    layer.height === documentHeight
}

function createLocalizedRasterLayerForPenStart(layer, documentPoint, brushSize) {
  if (!layer || !documentPoint) {
    return layer
  }

  const initialSize = Math.max(1, Math.ceil(brushSize + 4))

  return {
    ...layer,
    x: documentPoint.x - (initialSize / 2),
    y: documentPoint.y - (initialSize / 2),
    width: initialSize,
    height: initialSize,
  }
}

function scaleLayerAroundOwnCenter(layer, ratioX, ratioY) {
  if (!layer) {
    return layer
  }

  if (layer.type === 'text') {
    if (layer.mode === 'box') {
      const nextWidth = clampValue(layer.width * ratioX, MIN_LAYER_WIDTH, MAX_LAYER_SIZE)
      const nextHeight = clampValue(layer.height * ratioY, MIN_LAYER_HEIGHT, MAX_LAYER_SIZE)
      const centerX = layer.x + (layer.width / 2)
      const centerY = layer.y + (layer.height / 2)

      return resizeBoxText(
        {
          ...layer,
          x: centerX - (nextWidth / 2),
          y: centerY - (nextHeight / 2),
        },
        nextWidth,
        nextHeight,
      )
    }

    const maximumScaleX = MAX_LAYER_SIZE / Math.max(layer.width, 1)
    const maximumScaleY = MAX_LAYER_SIZE / Math.max(layer.height, 1)

    return {
      ...resizePointTextTransform(
        layer,
        clampValue(layer.scaleX * ratioX, 0.1, maximumScaleX),
        clampValue(layer.scaleY * ratioY, 0.1, maximumScaleY),
      ),
      width: layer.measuredWidth ?? layer.width,
      height: layer.measuredHeight ?? layer.height,
    }
  }

  const nextWidth = clampValue(layer.width * ratioX, MIN_LAYER_WIDTH, MAX_LAYER_SIZE)
  const nextHeight = clampValue(layer.height * ratioY, MIN_LAYER_HEIGHT, MAX_LAYER_SIZE)
  const centerX = layer.x + (layer.width / 2)
  const centerY = layer.y + (layer.height / 2)

  return {
    ...layer,
    x: centerX - (nextWidth / 2),
    y: centerY - (nextHeight / 2),
    width: nextWidth,
    height: nextHeight,
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
    previewOffsetX: 0,
    previewOffsetY: 0,
    previewWidth: null,
    previewHeight: null,
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

function toDocumentCoordinates(pointerEvent, element, viewport, documentScale) {
  const pointerPosition = getPointerPositionWithinElement(pointerEvent, element)

  if (!pointerPosition) {
    return null
  }

  return {
    ...screenToWorld(pointerPosition.x, pointerPosition.y, {
      ...viewport,
      zoom: viewport.zoom * documentScale,
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

function clampSurfacePoint(layer, surfaceCanvas, localPoint) {
  if (!layer || !surfaceCanvas || !localPoint) {
    return null
  }

  const normalizedX = localPoint.x / Math.max(layer.width, 1)
  const normalizedY = localPoint.y / Math.max(layer.height, 1)

  return {
    x: Math.min(Math.max(normalizedX, 0), 1) * surfaceCanvas.width,
    y: Math.min(Math.max(normalizedY, 0), 1) * surfaceCanvas.height,
  }
}

function documentPointToLayerSurfacePoint(layer, surfaceCanvas, documentPoint, clampToSurface = true) {
  if (!layer || !surfaceCanvas || !documentPoint) {
    return null
  }

  const localPoint = toLayerLocalPoint(layer, documentPoint)

  if (!localPoint) {
    return null
  }

  const normalizedX = localPoint.x / Math.max(layer.width, 1)
  const normalizedY = localPoint.y / Math.max(layer.height, 1)
  const surfaceX = normalizedX * surfaceCanvas.width
  const surfaceY = normalizedY * surfaceCanvas.height

  if (!clampToSurface) {
    return {
      x: surfaceX,
      y: surfaceY,
    }
  }

  return {
    x: Math.min(Math.max(surfaceX, 0), surfaceCanvas.width),
    y: Math.min(Math.max(surfaceY, 0), surfaceCanvas.height),
  }
}

function transformLayerLocalVectorToDocument(layer, x, y) {
  const angle = (layer.rotation * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const scaledX = x * layer.scaleX
  const scaledY = y * layer.scaleY

  return {
    x: (scaledX * cosine) - (scaledY * sine),
    y: (scaledX * sine) + (scaledY * cosine),
  }
}

function expandRasterLayerSurfaceToFitPoint(layer, surfaceCanvas, localPoint, padding = 0) {
  if (layer?.type !== 'raster' || !surfaceCanvas || !localPoint) {
    return null
  }

  const expandLeft = Math.max(0, Math.ceil(padding - localPoint.x))
  const expandTop = Math.max(0, Math.ceil(padding - localPoint.y))
  const expandRight = Math.max(0, Math.ceil(localPoint.x + padding - layer.width))
  const expandBottom = Math.max(0, Math.ceil(localPoint.y + padding - layer.height))

  if (expandLeft === 0 && expandTop === 0 && expandRight === 0 && expandBottom === 0) {
    return null
  }

  const nextWidth = surfaceCanvas.width + expandLeft + expandRight
  const nextHeight = surfaceCanvas.height + expandTop + expandBottom
  const nextCanvas = createTransparentCanvas(nextWidth, nextHeight)
  const context = nextCanvas.getContext('2d')

  if (!context) {
    return null
  }

  context.drawImage(surfaceCanvas, expandLeft, expandTop)

  const centerDelta = transformLayerLocalVectorToDocument(
    layer,
    ((expandRight - expandLeft) / 2),
    ((expandBottom - expandTop) / 2),
  )
  const currentCenterX = layer.x + (layer.width / 2)
  const currentCenterY = layer.y + (layer.height / 2)
  const nextCenterX = currentCenterX + centerDelta.x
  const nextCenterY = currentCenterY + centerDelta.y

  return {
    canvas: nextCanvas,
    shiftX: expandLeft,
    shiftY: expandTop,
    layer: {
      ...layer,
      x: nextCenterX - (nextWidth / 2),
      y: nextCenterY - (nextHeight / 2),
      width: nextWidth,
      height: nextHeight,
    },
  }
}

function applySurfacePreviewLayout(entry) {
  const visibleCanvas = entry?.visibleCanvas

  if (!(visibleCanvas instanceof HTMLCanvasElement)) {
    return
  }

  const parentElement = visibleCanvas.parentElement
  const hasPreviewLayout = (
    Number.isFinite(entry.previewWidth) &&
    Number.isFinite(entry.previewHeight)
  )

  visibleCanvas.style.position = hasPreviewLayout ? 'absolute' : ''
  visibleCanvas.style.left = hasPreviewLayout ? `${-entry.previewOffsetX}px` : ''
  visibleCanvas.style.top = hasPreviewLayout ? `${-entry.previewOffsetY}px` : ''
  visibleCanvas.style.width = hasPreviewLayout ? `${entry.previewWidth}px` : ''
  visibleCanvas.style.height = hasPreviewLayout ? `${entry.previewHeight}px` : ''

  if (parentElement instanceof HTMLElement) {
    parentElement.style.overflow = hasPreviewLayout ? 'visible' : ''
  }
}

function canPaintWithPenOnLayer(layer) {
  return isRasterLayer(layer) || layer?.type === 'text'
}

function canLassoLayer(layer) {
  return isRasterLayer(layer) || layer?.type === 'text'
}

function canFillLayerWithBucket(layer) {
  return (
    layer?.type === 'shape' ||
    ((layer?.type === 'raster' || layer?.type === 'image') && !isSvgImageLayer(layer))
  )
}

function canApplyGradientToLayer(layer) {
  return (
    layer?.type === 'shape' ||
    ((layer?.type === 'raster' || layer?.type === 'image') && !isSvgImageLayer(layer))
  )
}

function getSingleSelectedLayer(documentState) {
  const selectedLayerIds = Array.isArray(documentState?.selectedLayerIds)
    ? documentState.selectedLayerIds
    : documentState?.selectedLayerId
      ? [documentState.selectedLayerId]
      : []

  if (selectedLayerIds.length !== 1) {
    return null
  }

  return findLayer(documentState, selectedLayerIds[0])
}

function getSelectedLayerCount(documentState) {
  const selectedLayerIds = Array.isArray(documentState?.selectedLayerIds)
    ? documentState.selectedLayerIds
    : documentState?.selectedLayerId
      ? [documentState.selectedLayerId]
      : []

  return selectedLayerIds.length
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

function createRasterizedLayerPatch(layer, bitmap, overrides = {}) {
  if (!layer) {
    return {
      bitmap,
      ...overrides,
    }
  }

  if (layer.type === 'image' || layer.type === 'raster') {
    return createImageLayerBitmapPatch(layer, bitmap, overrides)
  }

  return {
    ...layer,
    type: 'image',
    src: bitmap,
    bitmap,
    sourceKind: 'bitmap',
    fit: 'fill',
    shadowLayerId: null,
    shadowSourceLayerId: null,
    isTextShadow: false,
    ...overrides,
  }
}

const DEFAULT_TEXT_SHADOW_OFFSET_X = 8
const DEFAULT_TEXT_SHADOW_OFFSET_Y = 8
const DEFAULT_TEXT_SHADOW_OPACITY = 0.4

function layerLocalPointToDocumentPoint(layer, surfaceWidth, surfaceHeight, point) {
  if (!layer || !point || surfaceWidth <= 0 || surfaceHeight <= 0) {
    return null
  }

  const normalizedX = (point.x / surfaceWidth) * layer.width
  const normalizedY = (point.y / surfaceHeight) * layer.height
  const angle = (layer.rotation * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const centerX = layer.x + (layer.width / 2)
  const centerY = layer.y + (layer.height / 2)
  const centeredX = (normalizedX - (layer.width / 2)) * layer.scaleX
  const centeredY = (normalizedY - (layer.height / 2)) * layer.scaleY

  return {
    x: centerX + (centeredX * cosine) - (centeredY * sine),
    y: centerY + (centeredX * sine) + (centeredY * cosine),
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
  const textEditorRef = useRef(null)
  const toolPanelErrorFadeTimeoutRef = useRef(null)
  const toolPanelErrorClearTimeoutRef = useRef(null)
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
  } = useHistory(createInitialDocument(DEFAULT_DOCUMENT_WIDTH, DEFAULT_DOCUMENT_HEIGHT))
  const documentStateRef = useRef(documentState)
  documentStateRef.current = documentState
  const [savedDocumentSignature, setSavedDocumentSignature] = useState(() => (
    serializeProjectFile(documentState)
  ))
  const [editingTextLayerId, setEditingTextLayerId] = useState(null)
  const [textDraft, setTextDraft] = useState('')
  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false)
  const [isUnsavedChangesModalOpen, setIsUnsavedChangesModalOpen] = useState(false)
  const [newFileNameInput, setNewFileNameInput] = useState(DEFAULT_DOCUMENT_NAME)
  const [newFileWidthInput, setNewFileWidthInput] = useState(String(DEFAULT_DOCUMENT_WIDTH))
  const [newFileHeightInput, setNewFileHeightInput] = useState(String(DEFAULT_DOCUMENT_HEIGHT))
  const [toolPanelError, setToolPanelError] = useState({
    message: '',
    isVisible: false,
    isFading: false,
  })
  const [activeTool, setActiveTool] = useState('select')
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
  const [isSnapEnabled] = useState(true)
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
  const documentWidth = documentState.width ?? DEFAULT_DOCUMENT_WIDTH
  const documentHeight = documentState.height ?? DEFAULT_DOCUMENT_HEIGHT
  const documentName = normalizeNewFileNameInput(documentState.name, DEFAULT_DOCUMENT_NAME)
  const currentDocumentSignature = useMemo(() => serializeProjectFile(documentState), [documentState])
  const hasUnsavedChanges = currentDocumentSignature !== savedDocumentSignature
  const documentScale = DISPLAY_DOCUMENT_WIDTH / Math.max(documentWidth, 1)
  const selectedLayerShadow = selectedLayer?.type === 'text' && !selectedLayer?.isTextShadow && selectedLayer.shadowLayerId
    ? findLayer(documentState, selectedLayer.shadowLayerId)
    : null
  const linkedLayer = selectedLayer?.linkedLayerId
    ? findLayer(documentState, selectedLayer.linkedLayerId)
    : null
  const canLinkSelectedLayers = selectedLayerIds.length === 2
  const selectedPairAlreadyLinked = canLinkSelectedLayers && (
    selectedLayers[0]?.linkedLayerId === selectedLayers[1]?.id &&
    selectedLayers[1]?.linkedLayerId === selectedLayers[0]?.id
  )
  const selectionBounds = getSelectionBoundsFromLayers(selectedLayers)
  const hasMultiSelection = selectedLayerIds.length > 1
  const currentTool = activeTool
  const activeBrushTool = currentTool === 'eraser' ? 'eraser' : 'pen'
  const hasActiveLassoSelection = Boolean(lassoSelection?.isClosed)
  const hasFloatingSelection = Boolean(floatingSelection)

  const clearToolPanelErrorTimers = useCallback(() => {
    if (toolPanelErrorFadeTimeoutRef.current) {
      window.clearTimeout(toolPanelErrorFadeTimeoutRef.current)
      toolPanelErrorFadeTimeoutRef.current = null
    }

    if (toolPanelErrorClearTimeoutRef.current) {
      window.clearTimeout(toolPanelErrorClearTimeoutRef.current)
      toolPanelErrorClearTimeoutRef.current = null
    }
  }, [])

  const showToolPanelError = useCallback((message) => {
    clearToolPanelErrorTimers()
    setToolPanelError({
      message,
      isVisible: true,
      isFading: false,
    })

    toolPanelErrorFadeTimeoutRef.current = window.setTimeout(() => {
      setToolPanelError((currentValue) => (
        currentValue.isVisible
          ? { ...currentValue, isFading: true }
          : currentValue
      ))
      toolPanelErrorFadeTimeoutRef.current = null
    }, TOOL_PANEL_ERROR_FADE_DELAY_MS)

    toolPanelErrorClearTimeoutRef.current = window.setTimeout(() => {
      setToolPanelError({
        message: '',
        isVisible: false,
        isFading: false,
      })
      toolPanelErrorClearTimeoutRef.current = null
    }, TOOL_PANEL_ERROR_DURATION_MS)
  }, [clearToolPanelErrorTimers])

  useEffect(() => (
    () => {
      clearToolPanelErrorTimers()
    }
  ), [clearToolPanelErrorTimers])

  const activateTool = useCallback((nextTool) => {
    setActiveTool(nextTool)

    if (
      !documentState.layers.length &&
      ['pen', 'eraser', 'bucket', 'gradient'].includes(nextTool)
    ) {
      showToolPanelError(NO_LAYERS_TOOL_ERROR_MESSAGE)
    }
  }, [documentState.layers.length, showToolPanelError])

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

  useEffect(() => {
    if (!editingTextLayerId || !textEditorRef.current) {
      return
    }

    const textarea = textEditorRef.current
    const selectionIndex = textarea.value.length

    textarea.focus()
    textarea.setSelectionRange(selectionIndex, selectionIndex)
  }, [editingTextLayerId])

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
    applySurfacePreviewLayout(entry)
  }, [])

  const getLayerSurfaceKey = useCallback((layer) => {
    if (layer?.type === 'shape') {
      return JSON.stringify({
        type: layer.type,
        width: layer.width,
        height: layer.height,
        fill: layer.fill,
        radius: layer.radius,
      })
    }

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
    if (!(isErasableLayer(layer) || layer?.type === 'shape')) {
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

    if (layer.type === 'shape') {
      canvas = createTransparentCanvas(layer.width, layer.height)
      const shapeContext = canvas.getContext('2d')

      if (shapeContext) {
        shapeContext.fillStyle = layer.fill
        drawRoundedRect(shapeContext, layer.width, layer.height, layer.radius)
        shapeContext.fill()
      }

      maskCanvas = null
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
    context.translate(
      (layer.x + (layer.width / 2)) - offsetX,
      (layer.y + (layer.height / 2)) - offsetY,
    )
    context.rotate((layer.rotation * Math.PI) / 180)
    context.scale(layer.scaleX, layer.scaleY)
    context.translate(-(layer.width / 2), -(layer.height / 2))

    if (layer.type === 'shape') {
      context.fillStyle = layer.fill
      drawRoundedRect(context, layer.width, layer.height, layer.radius)
      context.fill()
      context.restore()
      return
    }

    const surfaceCanvas = await ensureRasterLayerSurface(layer)

    if (surfaceCanvas) {
      context.drawImage(
        surfaceCanvas,
        0,
        0,
        layer.width,
        layer.height,
      )
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
    const mergedWidth = bounds.width
    const mergedHeight = bounds.height
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

    overlayCanvas.width = documentWidth
    overlayCanvas.height = documentHeight

    const context = overlayCanvas.getContext('2d')

    if (!context) {
      return
    }

    context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

      if (lassoSelection) {
        renderLassoSelection(context, lassoSelection)
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
      context.moveTo(documentWidth / 2, 0)
      context.lineTo(documentWidth / 2, documentHeight)
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
      context.lineTo(0, documentHeight)
      context.stroke()
      context.restore()
    }

    if (activeMoveGuides.showRightEdge) {
      context.save()
      context.strokeStyle = '#0f766e'
      context.lineWidth = 1.5
      context.setLineDash([10, 6])
      context.beginPath()
      context.moveTo(documentWidth, 0)
      context.lineTo(documentWidth, documentHeight)
      context.stroke()
      context.restore()
    }

    if (activeMoveGuides.showHorizontalCenter) {
      context.save()
      context.strokeStyle = '#0f766e'
      context.lineWidth = 1.5
      context.setLineDash([10, 6])
      context.beginPath()
      context.moveTo(0, documentHeight / 2)
      context.lineTo(documentWidth, documentHeight / 2)
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
      context.lineTo(documentWidth, 0)
      context.stroke()
      context.restore()
    }

    if (activeMoveGuides.showBottomEdge) {
      context.save()
      context.strokeStyle = '#0f766e'
      context.lineWidth = 1.5
      context.setLineDash([10, 6])
      context.beginPath()
      context.moveTo(0, documentHeight)
      context.lineTo(documentWidth, documentHeight)
      context.stroke()
      context.restore()
    }
  }, [activeMoveGuides, documentHeight, documentState, documentWidth, floatingSelection, gradientPreview, lassoSelection])

  useEffect(() => {
    function handlePointerMove(event) {
      const interaction = interactionRef.current
      const canvas = canvasRef.current

      if (!interaction || !canvas) {
        return
      }

      const liveDocumentState = documentStateRef.current

      const documentPoint = toDocumentCoordinates(event, canvas, viewport, documentScale)

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
          documentWidth,
          documentHeight,
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

        setTransient((currentDocument) => {
          let nextDocument = updateLayer(currentDocument, interaction.layerId, {
            x: snapResult.x,
            y: snapResult.y,
          })

          if (interaction.linkedLayerId && interaction.linkedOriginalPosition) {
            nextDocument = updateLayer(nextDocument, interaction.linkedLayerId, {
              x: interaction.linkedOriginalPosition.x + (snapResult.x - interaction.startX),
              y: interaction.linkedOriginalPosition.y + (snapResult.y - interaction.startY),
            })
          }

          return nextDocument
        })
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
          documentWidth,
          documentHeight,
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
        const startLayer = {
          x: interaction.startX,
          y: interaction.startY,
          width: interaction.startWidth,
          height: interaction.startHeight,
          rotation: interaction.startRotation,
          scaleX: interaction.startScaleX,
          scaleY: interaction.startScaleY,
        }
        const localPoint = toLayerLocalPoint(startLayer, documentPoint)

        if (!localPoint) {
          return
        }

        const minimumWidth = MIN_LAYER_WIDTH / Math.max(Math.abs(interaction.startScaleX), 0.1)
        const minimumHeight = MIN_LAYER_HEIGHT / Math.max(Math.abs(interaction.startScaleY), 0.1)
        const maximumWidth = MAX_LAYER_SIZE / Math.max(Math.abs(interaction.startScaleX), 0.1)
        const maximumHeight = MAX_LAYER_SIZE / Math.max(Math.abs(interaction.startScaleY), 0.1)
        let nextWidth = interaction.startWidth
        let nextHeight = interaction.startHeight
        let centerLocalX = interaction.startWidth / 2
        let centerLocalY = interaction.startHeight / 2

        if (interaction.handle.x !== 0) {
          const anchorX = interaction.handle.x === -1 ? interaction.startWidth : 0
          const minimumMovingX = interaction.handle.x === -1
            ? anchorX - maximumWidth
            : anchorX + minimumWidth
          const maximumMovingX = interaction.handle.x === -1
            ? anchorX - minimumWidth
            : anchorX + maximumWidth
          const movingX = clampValue(localPoint.x, minimumMovingX, maximumMovingX)

          nextWidth = Math.max(minimumWidth, Math.abs(anchorX - movingX))
          centerLocalX = (anchorX + movingX) / 2
        }

        if (interaction.handle.y !== 0) {
          const anchorY = interaction.handle.y === -1 ? interaction.startHeight : 0
          const minimumMovingY = interaction.handle.y === -1
            ? anchorY - maximumHeight
            : anchorY + minimumHeight
          const maximumMovingY = interaction.handle.y === -1
            ? anchorY - minimumHeight
            : anchorY + maximumHeight
          const movingY = clampValue(localPoint.y, minimumMovingY, maximumMovingY)

          nextHeight = Math.max(minimumHeight, Math.abs(anchorY - movingY))
          centerLocalY = (anchorY + movingY) / 2
        }

        if (interaction.handle.x !== 0 && interaction.handle.y !== 0 && event.shiftKey) {
          const widthRatio = nextWidth / Math.max(interaction.startWidth, 1)
          const heightRatio = nextHeight / Math.max(interaction.startHeight, 1)
          const dominantRatio =
            Math.abs(widthRatio - 1) > Math.abs(heightRatio - 1) ? widthRatio : heightRatio
          const minimumUniformRatio = Math.max(
            minimumWidth / Math.max(interaction.startWidth, 1),
            minimumHeight / Math.max(interaction.startHeight, 1),
          )
          const maximumUniformRatio = Math.min(
            maximumWidth / Math.max(interaction.startWidth, 1),
            maximumHeight / Math.max(interaction.startHeight, 1),
          )
          const uniformRatio = clampValue(
            dominantRatio,
            minimumUniformRatio,
            maximumUniformRatio,
          )

          nextWidth = interaction.startWidth * uniformRatio
          nextHeight = interaction.startHeight * uniformRatio

          if (interaction.handle.x === -1) {
            centerLocalX = interaction.startWidth - (nextWidth / 2)
          } else if (interaction.handle.x === 1) {
            centerLocalX = nextWidth / 2
          }

          if (interaction.handle.y === -1) {
            centerLocalY = interaction.startHeight - (nextHeight / 2)
          } else if (interaction.handle.y === 1) {
            centerLocalY = nextHeight / 2
          }
        }

        const nextCenter = layerLocalPointToDocumentPoint(
          startLayer,
          interaction.startWidth,
          interaction.startHeight,
          {
            x: centerLocalX,
            y: centerLocalY,
          },
        )

        if (!nextCenter) {
          return
        }

        const nextX = nextCenter.x - (nextWidth / 2)
        const nextY = nextCenter.y - (nextHeight / 2)
        const nextFrameWidth = Math.min(
          MAX_LAYER_SIZE,
          nextWidth * Math.abs(interaction.startScaleX),
        )
        const nextFrameHeight = Math.min(
          MAX_LAYER_SIZE,
          nextHeight * Math.abs(interaction.startScaleY),
        )

        interactionRef.current = {
          ...interaction,
          hasChanged: true,
        }

        setTransient((currentDocument) => {
          let linkedRatioX = nextWidth / Math.max(interaction.startWidth, 1)
          let linkedRatioY = nextHeight / Math.max(interaction.startHeight, 1)
          let nextPrimaryLayer = null
          let nextDocument = updateLayer(currentDocument, interaction.layerId, (layer) => {
            if (interaction.layerType === 'text') {
              if (layer.mode === 'box') {
                const resizedWidth = Math.max(
                  minimumWidth,
                  nextFrameWidth / Math.max(Math.abs(interaction.startScaleX), 0.1),
                )
                const resizedHeight = Math.max(
                  minimumHeight,
                  nextFrameHeight / Math.max(Math.abs(interaction.startScaleY), 0.1),
                )

                linkedRatioX = resizedWidth / Math.max(interaction.startWidth, 1)
                linkedRatioY = resizedHeight / Math.max(interaction.startHeight, 1)

                nextPrimaryLayer = resizeBoxText(
                  {
                    ...layer,
                    x: nextX,
                    y: nextY,
                  },
                  resizedWidth,
                  resizedHeight,
                )

                linkedRatioX = nextPrimaryLayer.width / Math.max(interaction.startWidth, 1)
                linkedRatioY = nextPrimaryLayer.height / Math.max(interaction.startHeight, 1)

                return nextPrimaryLayer
              }

              const nextScaleX = Math.max(
                0.1,
                interaction.startScaleX * (nextWidth / Math.max(interaction.startWidth, 1)),
              )
              const nextScaleY = Math.max(
                0.1,
                interaction.startScaleY * (nextHeight / Math.max(interaction.startHeight, 1)),
              )

              nextPrimaryLayer = {
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

              linkedRatioX = nextScaleX / Math.max(interaction.startScaleX, 0.0001)
              linkedRatioY = nextScaleY / Math.max(interaction.startScaleY, 0.0001)

              return nextPrimaryLayer
            }

            nextPrimaryLayer = {
              ...layer,
              x: nextX,
              y: nextY,
              width: nextWidth,
              height: nextHeight,
            }

            linkedRatioX = nextPrimaryLayer.width / Math.max(interaction.startWidth, 1)
            linkedRatioY = nextPrimaryLayer.height / Math.max(interaction.startHeight, 1)

            return nextPrimaryLayer
          })

          if (interaction.linkedLayerId && interaction.linkedLayerStart) {
            nextDocument = updateLayer(nextDocument, interaction.linkedLayerId, (layer) => (
              scaleLayerAroundOwnCenter(
                {
                  ...layer,
                  ...interaction.linkedLayerStart,
                  linkedLayerId: layer.linkedLayerId,
                },
                linkedRatioX,
                linkedRatioY,
              )
            ))
          }

          return nextDocument
        })
      }

      if (interaction.type === 'resize-multi') {
        const deltaX = documentPoint.x - interaction.pointerStart.x
        const deltaY = documentPoint.y - interaction.pointerStart.y
        const startBounds = interaction.startBounds
        const maximumWidth = MAX_LAYER_SIZE
        const maximumHeight = MAX_LAYER_SIZE
        let nextX = startBounds.x
        let nextY = startBounds.y
        let nextWidth = startBounds.width
        let nextHeight = startBounds.height

        if (interaction.handle.x === 1) {
          nextWidth = clampValue(startBounds.width + deltaX, MIN_LAYER_WIDTH, maximumWidth)
        }

        if (interaction.handle.x === -1) {
          nextWidth = clampValue(startBounds.width - deltaX, MIN_LAYER_WIDTH, maximumWidth)
          nextX = startBounds.x + (startBounds.width - nextWidth)
        }

        if (interaction.handle.y === 1) {
          nextHeight = clampValue(startBounds.height + deltaY, MIN_LAYER_HEIGHT, maximumHeight)
        }

        if (interaction.handle.y === -1) {
          nextHeight = clampValue(startBounds.height - deltaY, MIN_LAYER_HEIGHT, maximumHeight)
          nextY = startBounds.y + (startBounds.height - nextHeight)
        }

        if (interaction.handle.x !== 0 && interaction.handle.y !== 0 && event.shiftKey) {
          const widthRatio = nextWidth / startBounds.width
          const heightRatio = nextHeight / startBounds.height
          const dominantRatio =
            Math.abs(widthRatio - 1) > Math.abs(heightRatio - 1) ? widthRatio : heightRatio
          const minimumUniformRatio = Math.max(
            MIN_LAYER_WIDTH / Math.max(startBounds.width, 1),
            MIN_LAYER_HEIGHT / Math.max(startBounds.height, 1),
          )
          const maximumUniformRatio = Math.min(
            maximumWidth / Math.max(startBounds.width, 1),
            maximumHeight / Math.max(startBounds.height, 1),
          )
          const uniformRatio = clampValue(
            dominantRatio,
            minimumUniformRatio,
            maximumUniformRatio,
          )
          nextWidth = startBounds.width * uniformRatio
          nextHeight = startBounds.height * uniformRatio

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
                  clampValue(originalState.width * ratioX, MIN_LAYER_WIDTH, MAX_LAYER_SIZE),
                  clampValue(originalState.height * ratioY, MIN_LAYER_HEIGHT, MAX_LAYER_SIZE),
                )

                return resizedLayer
              }

              const maximumScaleX = MAX_LAYER_SIZE / Math.max(originalState.width, 1)
              const maximumScaleY = MAX_LAYER_SIZE / Math.max(originalState.height, 1)

              return {
                ...resizePointTextTransform(
                  {
                    ...layer,
                    x: scaledX,
                    y: scaledY,
                  },
                  clampValue(originalState.scaleX * ratioX, 0.1, maximumScaleX),
                  clampValue(originalState.scaleY * ratioY, 0.1, maximumScaleY),
                ),
                width: layer.measuredWidth ?? layer.width,
                height: layer.measuredHeight ?? layer.height,
              }
            }

            return {
              ...layer,
              x: scaledX,
              y: scaledY,
              width: clampValue(originalState.width * ratioX, MIN_LAYER_WIDTH, MAX_LAYER_SIZE),
              height: clampValue(originalState.height * ratioY, MIN_LAYER_HEIGHT, MAX_LAYER_SIZE),
            }
          }),
        }))
      }

      if (interaction.type === 'pen') {
        let currentLayer = interaction.workingLayer ?? findLayer(liveDocumentState, interaction.layerId)
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
        let nextRestoreCanvas = interaction.restoreCanvas
        let expandedLayer = currentLayer
        let nextPreviewOffsetX = interaction.previewOffsetX ?? 0
        let nextPreviewOffsetY = interaction.previewOffsetY ?? 0
        let layerExpanded = false

        for (const pointerSample of pointerSamples) {
          let layerPoint = null

          if (interaction.layerType === 'raster') {
            const sampleDocumentPoint = toDocumentCoordinates(pointerSample, canvas, viewport, documentScale)
            const sampleLocalPoint = sampleDocumentPoint
              ? toLayerLocalPoint(expandedLayer, sampleDocumentPoint)
              : null
            const expansion = sampleLocalPoint
              ? expandRasterLayerSurfaceToFitPoint(
                expandedLayer,
                nextRestoreCanvas,
                sampleLocalPoint,
                (interaction.size / 2) + 2,
              )
              : null

            if (expansion) {
              nextRestoreCanvas = expansion.canvas
              expandedLayer = expansion.layer
              nextPreviewOffsetX += expansion.shiftX
              nextPreviewOffsetY += expansion.shiftY
              nextPoints = nextPoints.map((point) => ({
                x: point.x + expansion.shiftX,
                y: point.y + expansion.shiftY,
              }))
              layerExpanded = true
            }

            if (sampleLocalPoint) {
              const expandedLocalPoint = expansion
                ? {
                  x: sampleLocalPoint.x + expansion.shiftX,
                  y: sampleLocalPoint.y + expansion.shiftY,
                }
                : sampleLocalPoint
              layerPoint = clampSurfacePoint(expandedLayer, nextRestoreCanvas, expandedLocalPoint)
            }
          } else {
            layerPoint = toLayerSurfacePoint(
              pointerSample,
              currentLayer,
              nextRestoreCanvas,
            )
          }

          if (!layerPoint) {
            continue
          }

          nextPoints = appendStrokePoint(nextPoints, layerPoint, interaction.minimumDistance)
        }

        if (layerExpanded) {
          currentLayer = expandedLayer
          surfaceEntry.previewOffsetX = nextPreviewOffsetX
          surfaceEntry.previewOffsetY = nextPreviewOffsetY
          surfaceEntry.previewWidth = expandedLayer.width
          surfaceEntry.previewHeight = expandedLayer.height
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

        const workingCanvas = cloneCanvas(nextRestoreCanvas)

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
              ? createMaskedCanvas(strokeCanvas, nextRestoreCanvas)
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
          workingLayer: currentLayer,
          previewOffsetX: nextPreviewOffsetX,
          previewOffsetY: nextPreviewOffsetY,
          points: nextPoints,
          restoreCanvas: nextRestoreCanvas,
          hasDragged,
          hasChanged: hasDragged,
        }
      }

      if (interaction.type === 'erase') {
        const currentLayer = findLayer(liveDocumentState, interaction.layerId)
        const surfaceEntry = rasterSurfacesRef.current.get(interaction.layerId)
        const layerPoint = currentLayer && surfaceEntry?.offscreenCanvas
          ? toLayerSurfacePoint(event, currentLayer, surfaceEntry.offscreenCanvas)
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
        const nextPoints = appendLassoPoint(interaction.points, documentPoint)

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
        const interactionLayer = findLayer(liveDocumentState, interaction.sourceLayerId)
        const layerPoint = interactionLayer && surfaceEntry?.offscreenCanvas
          ? toLayerSurfacePoint(event, interactionLayer, surfaceEntry.offscreenCanvas)
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
      const liveDocumentState = documentStateRef.current

      if (interaction?.type === 'pen') {
        const surfaceEntry = rasterSurfacesRef.current.get(interaction.layerId)
        const currentLayer = interaction.workingLayer ?? findLayer(liveDocumentState, interaction.layerId)

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

          const nextCanvas = previewCanvas

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
                  x: currentLayer.x,
                  y: currentLayer.y,
                  width: currentLayer.width,
                  height: currentLayer.height,
                }),
              ),
            )
          }
        }

        if (surfaceEntry) {
          surfaceEntry.previewOffsetX = 0
          surfaceEntry.previewOffsetY = 0
          surfaceEntry.previewWidth = null
          surfaceEntry.previewHeight = null
          applySurfacePreviewLayout(surfaceEntry)
        }

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
              const currentLayer = findLayer(liveDocumentState, interaction.layerId)

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
        const sourceLayer = findLayer(liveDocumentState, interaction.sourceLayerId)

        if (
          interaction.hasChanged &&
          surfaceEntry?.offscreenCanvas &&
          sourceLayer &&
          interaction.restoreCanvas
        ) {
          const workingCanvas = cloneCanvas(interaction.restoreCanvas)
          const gradientStartColor = interaction.mode === 'fg-to-transparent'
            ? globalColors.foreground
            : globalColors.background
          const gradientEndColor = interaction.mode === 'fg-to-transparent'
            ? createTransparentColorFromHex(globalColors.foreground)
            : globalColors.foreground
          const gradientResult = gradientEndColor
            ? applyLinearGradientToCanvas(
              workingCanvas,
              interaction.startPoint,
              interaction.endPoint,
              gradientStartColor,
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
                createBitmapEditableLayerPatch(nextLayer, nextBitmap),
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
  }, [
    commit,
    commitTransientChange,
    documentHeight,
    documentScale,
    documentState,
    documentWidth,
    drawRasterLayer,
    globalColors,
    isSnapEnabled,
    setTransient,
    viewport,
  ])

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

        if (selectedLayerIds.length > 0 || selectedDocumentLayer) {
          deleteSelectedLayers()
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
    selectedLayerIds,
    redo,
    undo,
    resetColors,
    swapColors,
    deleteSelectedLayers,
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

  function applyRasterizedLayerUpdate(currentDocument, layerId, bitmap, overrides = {}) {
    const sourceLayer = findLayer(currentDocument, layerId)

    if (!sourceLayer) {
      return currentDocument
    }

    let nextDocument = updateLayer(
      currentDocument,
      layerId,
      createRasterizedLayerPatch(sourceLayer, bitmap, overrides),
    )

    if (sourceLayer.type === 'text' && !sourceLayer.isTextShadow && sourceLayer.shadowLayerId) {
      nextDocument = updateLayer(nextDocument, sourceLayer.shadowLayerId, {
        shadowSourceLayerId: null,
      })
    }

    return nextDocument
  }

  function syncShadowLayerForTextSource(currentDocument, sourceLayerId) {
    const sourceLayer = findLayer(currentDocument, sourceLayerId)

    if (!sourceLayer || sourceLayer.type !== 'text' || sourceLayer.isTextShadow || !sourceLayer.shadowLayerId) {
      return currentDocument
    }

    const shadowLayer = findLayer(currentDocument, sourceLayer.shadowLayerId)

    if (!shadowLayer || shadowLayer.type !== 'text' || !shadowLayer.isTextShadow) {
      return updateLayer(currentDocument, sourceLayer.id, {
        shadowLayerId: null,
      })
    }

    const offsetX = shadowLayer.x - sourceLayer.x
    const offsetY = shadowLayer.y - sourceLayer.y

    return updateLayer(currentDocument, shadowLayer.id, {
      name: `${sourceLayer.name} Shadow`,
      text: sourceLayer.text,
      fontFamily: sourceLayer.fontFamily,
      fontSize: sourceLayer.fontSize,
      fontWeight: sourceLayer.fontWeight,
      fontStyle: sourceLayer.fontStyle,
      lineHeight: sourceLayer.lineHeight,
      letterSpacing: sourceLayer.letterSpacing,
      textAlign: sourceLayer.textAlign,
      mode: sourceLayer.mode,
      boxWidth: sourceLayer.boxWidth,
      boxHeight: sourceLayer.boxHeight,
      measuredWidth: sourceLayer.measuredWidth,
      measuredHeight: sourceLayer.measuredHeight,
      width: sourceLayer.width,
      height: sourceLayer.height,
      rotation: sourceLayer.rotation,
      scaleX: sourceLayer.scaleX,
      scaleY: sourceLayer.scaleY,
      x: sourceLayer.x + offsetX,
      y: sourceLayer.y + offsetY,
      color: '#000000',
      shadowSourceLayerId: sourceLayer.id,
    })
  }

  function handleAddTextShadow() {
    if (!selectedLayer || selectedLayer.type !== 'text' || selectedLayer.isTextShadow) {
      return
    }

    commit((currentDocument) => {
      const sourceLayer = findLayer(currentDocument, selectedLayer.id)

      if (!sourceLayer || sourceLayer.type !== 'text' || sourceLayer.isTextShadow) {
        return currentDocument
      }

      const existingShadow = sourceLayer.shadowLayerId
        ? findLayer(currentDocument, sourceLayer.shadowLayerId)
        : null

      if (existingShadow?.type === 'text' && existingShadow.isTextShadow) {
        return currentDocument
      }

      const shadowLayer = createTextShadowLayer(sourceLayer, {
        offsetX: DEFAULT_TEXT_SHADOW_OFFSET_X,
        offsetY: DEFAULT_TEXT_SHADOW_OFFSET_Y,
        opacity: DEFAULT_TEXT_SHADOW_OPACITY,
      })
      const sourceIndex = currentDocument.layers.findIndex((layer) => layer.id === sourceLayer.id)

      if (sourceIndex === -1) {
        return currentDocument
      }

      const nextLayers = [...currentDocument.layers]
      nextLayers.splice(sourceIndex, 0, shadowLayer)

      const nextDocument = {
        ...currentDocument,
        layers: nextLayers.map((layer) => (
          layer.id === sourceLayer.id
            ? {
              ...layer,
              shadowLayerId: shadowLayer.id,
            }
            : layer
        )),
      }

      return linkLayerPair(nextDocument, sourceLayer.id, shadowLayer.id)
    })
  }

  function handleLinkSelectedLayers() {
    if (!canLinkSelectedLayers || selectedLayers.length !== 2) {
      return
    }

    applyDocumentChange((currentDocument) => linkLayerPair(
      currentDocument,
      selectedLayers[0].id,
      selectedLayers[1].id,
    ))
  }

  function handleUnlinkSelectedLayers() {
    if (!canLinkSelectedLayers || selectedLayers.length !== 2) {
      return
    }

    applyDocumentChange((currentDocument) => unlinkLayerPair(currentDocument, selectedLayers[0].id))
  }

  function handleUnlinkSelectedLayer() {
    if (!selectedLayer?.linkedLayerId) {
      return
    }

    applyDocumentChange((currentDocument) => unlinkLayerPair(currentDocument, selectedLayer.id))
  }

  function deleteSelectedLayers() {
    commit((currentDocument) => {
      const currentSelectedLayerIds = Array.isArray(currentDocument.selectedLayerIds)
        ? currentDocument.selectedLayerIds
        : currentDocument.selectedLayerId
          ? [currentDocument.selectedLayerId]
          : []

      if (currentSelectedLayerIds.length === 0) {
        return currentDocument
      }

      return removeLayers(currentDocument, currentSelectedLayerIds)
    })
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
    const selectedDocumentLayer = getSingleSelectedLayer(documentState)
    const selectedLayerCount = getSelectedLayerCount(documentState)

    if (selectedDocumentLayer && canPaintWithPenOnLayer(selectedDocumentLayer)) {
      lastPenEditableLayerIdRef.current = selectedDocumentLayer.id
      return selectedDocumentLayer
    }

    if (selectedDocumentLayer && isSvgImageLayer(selectedDocumentLayer)) {
      const nextLayer = createRasterLayer({
        name: `${selectedDocumentLayer.name} Paint`,
        width: documentWidth,
        height: documentHeight,
      })

      lastPenEditableLayerIdRef.current = nextLayer.id
      commit((currentDocument) => insertLayer(currentDocument, nextLayer, selectedDocumentLayer.id))
      return nextLayer
    }

    if (selectedLayerCount > 0) {
      return null
    }

    if (isSvgImageLayer(targetLayer)) {
      const nextLayer = createRasterLayer({
        name: `${targetLayer.name} Paint`,
        width: documentWidth,
        height: documentHeight,
      })

      lastPenEditableLayerIdRef.current = nextLayer.id
      commit((currentDocument) => insertLayer(currentDocument, nextLayer, targetLayer.id))
      return nextLayer
    }

    if (targetLayer && canPaintWithPenOnLayer(targetLayer)) {
      lastPenEditableLayerIdRef.current = targetLayer.id
      return targetLayer
    }

    if (lastPenEditableLayerIdRef.current) {
      const lastPenEditableLayer = findLayer(documentState, lastPenEditableLayerIdRef.current)

      if (lastPenEditableLayer && canPaintWithPenOnLayer(lastPenEditableLayer)) {
        return lastPenEditableLayer
      }
    }

    const nextLayer = createRasterLayer({
      name: 'Drawing Layer',
      width: documentWidth,
      height: documentHeight,
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
    const normalizedDocument = normalizeDocumentState(nextDocumentState)

    resetEditorRuntimeState()
    setIsNewFileModalOpen(false)
    setIsUnsavedChangesModalOpen(false)
    setSavedDocumentSignature(serializeProjectFile(normalizedDocument))
    reset(normalizedDocument)
  }, [reset, resetEditorRuntimeState])

  function openNewFileModal() {
    setNewFileNameInput(DEFAULT_DOCUMENT_NAME)
    setNewFileWidthInput(String(DEFAULT_DOCUMENT_WIDTH))
    setNewFileHeightInput(String(DEFAULT_DOCUMENT_HEIGHT))
    setIsNewFileModalOpen(true)
  }

  function handleNewFile() {
    setIsFileMenuOpen(false)

    if (hasUnsavedChanges) {
      setIsUnsavedChangesModalOpen(true)
      return
    }

    openNewFileModal()
  }

  const handleCancelNewFile = useCallback(() => {
    setIsNewFileModalOpen(false)
  }, [])

  const handleCancelUnsavedChanges = useCallback(() => {
    setIsUnsavedChangesModalOpen(false)
  }, [])

  const handleDiscardAndCreateNew = useCallback(() => {
    setIsUnsavedChangesModalOpen(false)
    openNewFileModal()
  }, [])

  const handleCreateNewFile = useCallback(() => {
    const name = normalizeNewFileNameInput(newFileNameInput, DEFAULT_DOCUMENT_NAME)
    const width = normalizeNewFileDimensionInput(newFileWidthInput, DEFAULT_DOCUMENT_WIDTH)
    const height = normalizeNewFileDimensionInput(newFileHeightInput, DEFAULT_DOCUMENT_HEIGHT)

    setNewFileNameInput(name)
    setNewFileWidthInput(String(width))
    setNewFileHeightInput(String(height))
    loadDocumentState(createInitialDocument(width, height, name))
  }, [loadDocumentState, newFileHeightInput, newFileNameInput, newFileWidthInput])

  useEffect(() => {
    if (!isNewFileModalOpen) {
      return undefined
    }

    function handleNewFileModalKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleCancelNewFile()
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        handleCreateNewFile()
      }
    }

    window.addEventListener('keydown', handleNewFileModalKeyDown)

    return () => {
      window.removeEventListener('keydown', handleNewFileModalKeyDown)
    }
  }, [handleCancelNewFile, handleCreateNewFile, isNewFileModalOpen])

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return undefined
    }

    function handleBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasUnsavedChanges])

  function handleSaveFile() {
    setIsFileMenuOpen(false)
    downloadProjectFile(documentState, getDocumentFilenameBase(documentName, 'fukmall-project'))
    setSavedDocumentSignature(currentDocumentSignature)
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
        documentWidth,
        documentHeight,
        format,
        getDocumentFilenameBase(documentName, 'fukmall-export'),
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
      const position = getDefaultImportedImagePosition(
        dimensions.width,
        dimensions.height,
        documentWidth,
        documentHeight,
      )

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
      documentWidth,
      documentHeight,
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
    const dropPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)

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

    applyDocumentChange((currentDocument) => {
      const nextDocument = updateLayer(currentDocument, selectedLayer.id, patch)

      if (selectedLayer.type === 'text' && !selectedLayer.isTextShadow) {
        return syncShadowLayerForTextSource(nextDocument, selectedLayer.id)
      }

      return nextDocument
    })
  }

  function applyTextLayerUpdate(layerId, updater, applyTransient = false) {
    const runner = applyTransient ? setTransient : applyDocumentChange

    runner((currentDocument) => {
      const nextDocument = updateLayer(currentDocument, layerId, (layer) => (
        layer.type === 'text' ? updater(layer) : layer
      ))
      const nextLayer = findLayer(nextDocument, layerId)

      if (nextLayer?.type === 'text' && !nextLayer.isTextShadow) {
        return syncShadowLayerForTextSource(nextDocument, layerId)
      }

      return nextDocument
    })
  }

  function getActiveLassoLayer() {
    const selectedDocumentLayer = getSingleSelectedLayer(documentState)

    if (!selectedDocumentLayer || !canLassoLayer(selectedDocumentLayer)) {
      return null
    }

    return selectedDocumentLayer
  }

  function toLayerSurfacePoint(pointerEvent, layer, surfaceCanvas) {
    const documentPoint = toDocumentCoordinates(pointerEvent, canvasRef.current, viewport, documentScale)

    if (!documentPoint) {
      return null
    }

    const localPoint = toLayerLocalPoint(layer, documentPoint)

    if (!isPointInsideLayerFrame(layer, localPoint)) {
      return null
    }

    return clampSurfacePoint(layer, surfaceCanvas, localPoint)
  }

  function createSourceSelectionFromDocumentSelection(layer, sourceCanvas, selection) {
    if (!layer || !sourceCanvas || !selection?.points?.length) {
      return null
    }

    return finalizeLassoSelection(selection.points.map((point) => (
      documentPointToLayerSurfacePoint(layer, sourceCanvas, point, false)
    )).filter(Boolean))
  }

  function createFloatingSelectionFromDocumentSelection(
    layer,
    sourceCanvas,
    documentSelection,
    mode,
    restoreCanvas = null,
  ) {
    const sourceSelection = createSourceSelectionFromDocumentSelection(
      layer,
      sourceCanvas,
      documentSelection,
    )

    if (!sourceSelection?.bounds) {
      return null
    }

    const extractedCanvas = extractSelectionToCanvas(sourceCanvas, sourceSelection)

    if (!extractedCanvas) {
      return null
    }

    const scaleX = layer.width / Math.max(sourceCanvas.width, 1)
    const scaleY = layer.height / Math.max(sourceCanvas.height, 1)

    return {
      sourceLayerId: layer.id,
      canvas: extractedCanvas,
      x: layer.x + (sourceSelection.bounds.minX * scaleX),
      y: layer.y + (sourceSelection.bounds.minY * scaleY),
      width: extractedCanvas.width * scaleX,
      height: extractedCanvas.height * scaleY,
      selectionPoints: documentSelection.points.map((point) => ({
        x: point.x - documentSelection.bounds.minX,
        y: point.y - documentSelection.bounds.minY,
      })),
      mode,
      scaleX,
      scaleY,
      restoreCanvas,
      sourceSelection,
    }
  }

  function getLayerSurfaceAlpha(layer, localPoint) {
    const surfaceCanvas = rasterSurfacesRef.current.get(layer.id)?.offscreenCanvas

    if (!surfaceCanvas) {
      return null
    }

    const context = surfaceCanvas.getContext('2d', { willReadFrequently: true })

    if (!context) {
      return null
    }

    const normalizedX = localPoint.x / Math.max(layer.width, 1)
    const normalizedY = localPoint.y / Math.max(layer.height, 1)
    const canvasX = Math.min(
      surfaceCanvas.width - 1,
      Math.max(0, Math.floor(normalizedX * surfaceCanvas.width)),
    )
    const canvasY = Math.min(
      surfaceCanvas.height - 1,
      Math.max(0, Math.floor(normalizedY * surfaceCanvas.height)),
    )

    return context.getImageData(canvasX, canvasY, 1, 1).data[3]
  }

  function isLayerHitAtDocumentPoint(layer, documentPoint) {
    if (!layer?.visible) {
      return false
    }

    const localPoint = toLayerLocalPoint(layer, documentPoint)

    if (!isPointInsideLayerFrame(layer, localPoint)) {
      return false
    }

    if (layer.type === 'shape') {
      return isPointInsideRoundedRect(layer.width, layer.height, layer.radius, localPoint)
    }

    if (isRasterLayer(layer) || layer.type === 'text') {
      const alpha = getLayerSurfaceAlpha(layer, localPoint)
      return alpha === null ? true : alpha > 0
    }

    return true
  }

  function getTopmostSelectableLayerAtPoint(documentPoint) {
    for (let index = documentState.layers.length - 1; index >= 0; index -= 1) {
      const layer = documentState.layers[index]

      if (isLayerHitAtDocumentPoint(layer, documentPoint)) {
        return layer
      }
    }

    return null
  }

  function resolveEditToolTarget(eventLayer, isSupportedTarget) {
    const selectedDocumentLayer = getSingleSelectedLayer(documentState)
    const selectedLayerCount = getSelectedLayerCount(documentState)

    if (selectedDocumentLayer && isSupportedTarget(selectedDocumentLayer)) {
      return {
        layer: selectedDocumentLayer,
        shouldSelect: false,
      }
    }

    if (selectedLayerCount > 0) {
      return {
        layer: null,
        shouldSelect: false,
      }
    }

    if (eventLayer && isSupportedTarget(eventLayer)) {
      return {
        layer: eventLayer,
        shouldSelect: true,
      }
    }

    return {
      layer: null,
      shouldSelect: false,
    }
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

    const documentPoint = toDocumentCoordinates(event, canvas, viewport, documentScale)

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
    const linkedPartner = layer.linkedLayerId
      ? findLayer(documentState, layer.linkedLayerId)
      : null
    selectDocumentLayer(layer.id)
    interactionRef.current = {
      type: 'move',
      layerId: layer.id,
      startX: layer.x,
      startY: layer.y,
      linkedLayerId: linkedPartner?.id ?? null,
      linkedOriginalPosition: linkedPartner
        ? {
          x: linkedPartner.x,
          y: linkedPartner.y,
        }
        : null,
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

    const documentPoint = toDocumentCoordinates(event, canvas, viewport, documentScale)

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
    const linkedPartner = layer.linkedLayerId
      ? findLayer(documentState, layer.linkedLayerId)
      : null
    selectDocumentLayer(layer.id)
    interactionRef.current = {
      type: 'resize',
      layerId: layer.id,
      layerType: layer.type,
      linkedLayerId: linkedPartner?.id ?? null,
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
      startRotation: layer.rotation,
      startMode: layer.mode,
      linkedLayerStart: linkedPartner
        ? {
          x: linkedPartner.x,
          y: linkedPartner.y,
          width: linkedPartner.width,
          height: linkedPartner.height,
          scaleX: linkedPartner.scaleX,
          scaleY: linkedPartner.scaleY,
          type: linkedPartner.type,
          mode: linkedPartner.mode,
          measuredWidth: linkedPartner.measuredWidth,
          measuredHeight: linkedPartner.measuredHeight,
          boxWidth: linkedPartner.boxWidth,
          boxHeight: linkedPartner.boxHeight,
        }
        : null,
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

    if (!penLayer) {
      return
    }

    if (!isLayerSelected(documentState, penLayer.id)) {
      selectDocumentLayer(penLayer.id)
    }

    setActiveSvgToolLayerId(
      penLayer.type === 'image' && penLayer.sourceKind === 'svg' ? penLayer.id : null,
    )

    const surfaceEntry = getRasterSurfaceEntry(penLayer.id)
    const isTextPenLayer = penLayer.type === 'text'
    let interactionLayer = penLayer
    const initialDocumentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)
    let interactionSurface = null

    if (shouldLocalizeEmptyRasterLayerForPen(penLayer, documentWidth, documentHeight) && initialDocumentPoint) {
      interactionLayer = createLocalizedRasterLayerForPenStart(
        penLayer,
        initialDocumentPoint,
        penSize,
      )
      interactionSurface = createTransparentCanvas(interactionLayer.width, interactionLayer.height)
      surfaceEntry.previewOffsetX = penLayer.x - interactionLayer.x
      surfaceEntry.previewOffsetY = penLayer.y - interactionLayer.y
      surfaceEntry.previewWidth = interactionLayer.width
      surfaceEntry.previewHeight = interactionLayer.height
    } else {
      interactionSurface = await ensureRasterLayerSurface(penLayer)
    }

    if (penLayer.type === 'raster') {
      const documentPoint = initialDocumentPoint ?? toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)
      const localPoint = documentPoint ? toLayerLocalPoint(interactionLayer, documentPoint) : null
      const expansion = localPoint
        ? expandRasterLayerSurfaceToFitPoint(interactionLayer, interactionSurface, localPoint, (penSize / 2) + 2)
        : null

      if (expansion) {
        interactionLayer = expansion.layer
        interactionSurface = expansion.canvas
        surfaceEntry.offscreenCanvas = expansion.canvas
        surfaceEntry.previewOffsetX += expansion.shiftX
        surfaceEntry.previewOffsetY += expansion.shiftY
        surfaceEntry.previewWidth = expansion.layer.width
        surfaceEntry.previewHeight = expansion.layer.height
      }
    }

    const startPoint = toLayerSurfacePoint(event, interactionLayer, interactionSurface)

    if (!interactionSurface || !surfaceEntry || !startPoint) {
      return
    }

    let workingCanvas = null

    if (isTextPenLayer) {
      const overlayCanvas = surfaceEntry.paintOverlayCanvas
        ?? createEmptyMaskCanvas(interactionSurface.width, interactionSurface.height)
      workingCanvas = cloneCanvas(overlayCanvas)
      surfaceEntry.paintOverlayCanvas = overlayCanvas
    } else {
      workingCanvas = cloneCanvas(interactionSurface)
    }

    const restoreCanvas = cloneCanvas(workingCanvas)
    surfaceEntry.offscreenCanvas = isTextPenLayer
      ? composeTextLayerCanvases(penLayer, surfaceEntry.maskCanvas, workingCanvas).composedCanvas
      : workingCanvas
    drawRasterLayer(penLayer.id)

    interactionRef.current = {
      type: 'pen',
      layerId: penLayer.id,
      layerType: penLayer.type,
      workingLayer: interactionLayer,
      previewOffsetX: surfaceEntry.previewOffsetX,
      previewOffsetY: surfaceEntry.previewOffsetY,
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

    const target = resolveEditToolTarget(layer, isErasableLayer)
    const eraseLayer = target.layer

    if (!eraseLayer) {
      return
    }

    if (target.shouldSelect) {
      selectDocumentLayer(eraseLayer.id)
    }

    setActiveSvgToolLayerId(
      eraseLayer.type === 'image' && eraseLayer.sourceKind === 'svg' ? eraseLayer.id : null,
    )

    const surfaceCanvas = await ensureRasterLayerSurface(eraseLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(eraseLayer.id)
    const layerPoint = surfaceCanvas
      ? toLayerSurfacePoint(event, eraseLayer, surfaceCanvas)
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

    if (eraseLayer.type === 'text') {
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
      const baseCanvas = renderTextLayerToCanvas(eraseLayer)
      surfaceEntry.offscreenCanvas = applyEraseMask(baseCanvas, surfaceEntry.maskCanvas)
    } else {
      eraseDot(context, layerPoint.x, layerPoint.y, eraserSize)
    }

    drawRasterLayer(eraseLayer.id)

    interactionRef.current = {
      type: 'erase',
      layerId: eraseLayer.id,
      layerType: eraseLayer.type,
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

    const target = resolveEditToolTarget(layer, canFillLayerWithBucket)
    const fillLayer = target.layer

    if (!fillLayer) {
      return
    }

    if (target.shouldSelect) {
      selectDocumentLayer(fillLayer.id)
    }

    const surfaceCanvas = await ensureRasterLayerSurface(fillLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(fillLayer.id)
    const layerPoint = surfaceCanvas
      ? toLayerSurfacePoint(event, fillLayer, surfaceCanvas)
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
        preserveAlpha: isAlphaLocked(fillLayer),
        restrictToVisiblePixels: isAlphaLocked(fillLayer),
      },
    )

    if (!fillResult.changed) {
      return
    }

    surfaceEntry.offscreenCanvas = workingCanvas
    drawRasterLayer(fillLayer.id)

    const nextBitmap = canvasToBitmap(workingCanvas)

    commit((currentDocument) => {
      const currentLayer = findLayer(currentDocument, fillLayer.id)

      if (!currentLayer || !canFillLayerWithBucket(currentLayer)) {
        return currentDocument
      }

      return updateLayer(
        currentDocument,
        fillLayer.id,
        createBitmapEditableLayerPatch(currentLayer, nextBitmap),
      )
    })
  }

  async function beginGradient(event, layer) {
    event.stopPropagation()
    event.preventDefault()

    const target = resolveEditToolTarget(layer, canApplyGradientToLayer)
    const gradientLayer = target.layer

    if (!gradientLayer) {
      return
    }

    if (target.shouldSelect) {
      selectDocumentLayer(gradientLayer.id)
    }

    const surfaceCanvas = await ensureRasterLayerSurface(gradientLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(gradientLayer.id)
    const startPoint = surfaceCanvas
      ? toLayerSurfacePoint(event, gradientLayer, surfaceCanvas)
      : null

    if (!surfaceCanvas || !surfaceEntry || !startPoint) {
      return
    }

    setGradientPreview({
      layerId: gradientLayer.id,
      layer: {
        x: gradientLayer.x,
        y: gradientLayer.y,
        width: gradientLayer.width,
        height: gradientLayer.height,
        rotation: gradientLayer.rotation,
        scaleX: gradientLayer.scaleX,
        scaleY: gradientLayer.scaleY,
      },
      surfaceWidth: surfaceCanvas.width,
      surfaceHeight: surfaceCanvas.height,
      startPoint,
      endPoint: startPoint,
    })

    interactionRef.current = {
      type: 'gradient',
      sourceLayerId: gradientLayer.id,
      sourceLayer: {
        x: gradientLayer.x,
        y: gradientLayer.y,
        width: gradientLayer.width,
        height: gradientLayer.height,
        rotation: gradientLayer.rotation,
        scaleX: gradientLayer.scaleX,
        scaleY: gradientLayer.scaleY,
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

    const target = resolveEditToolTarget(layer, canLassoLayer)
    const lassoLayer = target.layer

    if (!lassoLayer) {
      return
    }

    setActiveSvgToolLayerId(
      lassoLayer.type === 'image' && lassoLayer.sourceKind === 'svg' ? lassoLayer.id : null,
    )

    if (target.shouldSelect) {
      selectDocumentLayer(lassoLayer.id)
    }

    const surfaceCanvas = await ensureRasterLayerSurface(lassoLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(lassoLayer.id)
    const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)

    if (!surfaceCanvas || !surfaceEntry || !documentPoint) {
      return
    }

    setFloatingSelection(null)

    const initialPoints = [documentPoint]

    setLassoSelection({
      sourceLayerId: lassoLayer.id,
      points: initialPoints,
      isDrawing: true,
      isClosed: false,
      bounds: null,
    })

    interactionRef.current = {
      type: 'lasso',
      layerId: lassoLayer.id,
      layerType: lassoLayer.type,
      points: initialPoints,
      hasChanged: false,
    }
  }

  function beginFloatingSelectionDrag(event) {
    const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)

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
    if (!(layerOverride ?? findLayer(documentState, sourceLayerId))) {
      return null
    }

    const points = nextFloatingSelection.selectionPoints.map((point) => ({
      x: point.x + nextFloatingSelection.x,
      y: point.y + nextFloatingSelection.y,
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

    if (!sourceLayer || !canLassoLayer(sourceLayer)) {
      return
    }

    const surfaceCanvas = await ensureRasterLayerSurface(sourceLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(sourceLayer.id)

    if (!surfaceCanvas || !surfaceEntry?.offscreenCanvas) {
      return
    }

    const restoreCanvas = cloneCanvas(surfaceEntry.offscreenCanvas)
    const nextFloatingSelection = createFloatingSelectionFromDocumentSelection(
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
      clearSelectionFromCanvas(surfaceEntry.offscreenCanvas, nextFloatingSelection.sourceSelection)
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

    if (!sourceLayer || !canLassoLayer(sourceLayer)) {
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
      applyRasterizedLayerUpdate(
        currentDocument,
        sourceLayer.id,
        canvasToBitmap(targetCanvas),
        {
          x: nextLayerX,
          y: nextLayerY,
          width: nextLayerWidth,
          height: nextLayerHeight,
        },
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

      if (!sourceLayer || !canLassoLayer(sourceLayer)) {
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
          ? applyRasterizedLayerUpdate(
            currentDocument,
            sourceLayer.id,
            canvasToBitmap(sourceEntry.offscreenCanvas),
          )
          : currentDocument

        return insertLayer(nextDocument, newLayer, sourceLayer.id)
      })

      const nextSelection = createSelectionFromFloating(floatingSelection, newLayer.id, newLayer)
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

    if (!sourceLayer || !canLassoLayer(sourceLayer)) {
      return
    }

    const sourceSurface = await ensureRasterLayerSurface(sourceLayer)

    if (!sourceSurface) {
      return
    }

    const extractedCanvas = createFloatingSelectionFromDocumentSelection(
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

    const nextSelection = createSelectionFromFloating(extractedCanvas, newLayer.id, newLayer)
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
        applyRasterizedLayerUpdate(
          currentDocument,
          sourceLayer.id,
          canvasToBitmap(sourceEntry.offscreenCanvas),
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

    if (!sourceLayer || !canLassoLayer(sourceLayer)) {
      return
    }

    const surfaceCanvas = await ensureRasterLayerSurface(sourceLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(sourceLayer.id)

    if (!surfaceCanvas || !surfaceEntry?.offscreenCanvas) {
      return
    }

    const sourceSelection = createSourceSelectionFromDocumentSelection(
      sourceLayer,
      surfaceCanvas,
      lassoSelection,
    )

    if (!sourceSelection) {
      return
    }

    const workingCanvas = cloneCanvas(surfaceEntry.offscreenCanvas)
    clearSelectionFromCanvas(workingCanvas, sourceSelection)

    commit((currentDocument) =>
      applyRasterizedLayerUpdate(
        currentDocument,
        sourceLayer.id,
        canvasToBitmap(workingCanvas),
      ),
    )

    setLassoSelection(null)
  }

  function handleLayerPointerDown(event, layer) {
    if (currentTool === 'zoom') {
      handleZoomPointer(event)
      return
    }

    if (currentTool === 'select') {
      const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)
      const hitLayer = documentPoint ? getTopmostSelectableLayerAtPoint(documentPoint) : layer

      event.stopPropagation()
      event.preventDefault()

      if (event.shiftKey) {
        if (hitLayer) {
          toggleDocumentLayerSelection(hitLayer.id)
        }
        return
      }

      if (!hitLayer) {
        clearDocumentSelection()
        return
      }

      startMove(event, hitLayer)
      return
    }

    if (currentTool === 'lasso') {
      event.stopPropagation()
      event.preventDefault()

      const lassoLayer = getActiveLassoLayer()

      if (!lassoLayer) {
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
        const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)

        if (documentPoint && !isPointInsidePolygon(documentPoint, lassoSelection.points)) {
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

    if (
      !documentState.layers.length &&
      (currentTool === 'pen' ||
        currentTool === 'eraser' ||
        currentTool === 'bucket' ||
        currentTool === 'gradient')
    ) {
      showToolPanelError(NO_LAYERS_TOOL_ERROR_MESSAGE)
      return
    }

    if (currentTool === 'lasso') {
      if (beginFloatingSelectionDrag(event)) {
        return
      }

      if (!(event.target instanceof HTMLElement) || !event.target.closest('.canvas-layer')) {
        const lassoLayer = getActiveLassoLayer()

        if (floatingSelection) {
          void commitFloatingSelectionToLayer(false)
          return
        }

        if (lassoSelection) {
          setLassoSelection(null)
        }

        if (lassoLayer) {
          void beginLasso(event, lassoLayer)
        }
      }

      return
    }

    if (currentTool === 'pen') {
      const activePenLayer = getSingleSelectedLayer(documentState)

      if (activePenLayer && canPaintWithPenOnLayer(activePenLayer)) {
        beginPenStroke(event, activePenLayer)
      }
      return
    }

    if (currentTool !== 'select') {
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
          zoom: currentViewport.zoom * documentScale,
        },
        pointerPosition.x,
        pointerPosition.y,
        zoomFactor,
        MIN_VIEWPORT_ZOOM * documentScale,
        MAX_VIEWPORT_ZOOM * documentScale,
      )

      return {
        zoom: nextViewport.zoom / documentScale,
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
    const showLassoCursor = currentTool === 'lasso' && canLassoLayer(layer)

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
          left: `${layer.x}px`,
          top: `${layer.y}px`,
          width: `${layer.width}px`,
          height: `${layer.height}px`,
          transform: `rotate(${layer.rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`,
          opacity: layer.opacity,
          zIndex: index + 1,
        }}
        onPointerDown={(event) => handleLayerPointerDown(event, layer)}
      >
        {layer.type === 'text' && (
          isEditingText ? (
            <textarea
              ref={textEditorRef}
              className="layer-body text-layer-body text-layer-editor"
              value={textDraft}
              style={{
                fontFamily: layer.fontFamily,
                fontSize: `${layer.fontSize}px`,
                fontStyle: layer.fontStyle,
                fontWeight: layer.fontWeight,
                lineHeight: layer.lineHeight,
                color: layer.color,
                textAlign: layer.textAlign ?? 'left',
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
        {isSelected && currentTool === 'select' && !hasMultiSelection && !isEditingText && (
          <div
            className="selection-frame interactive"
            onPointerDown={(event) => startMove(event, layer)}
            onDoubleClick={(event) => {
              if (layer.type !== 'text') {
                return
              }

              event.stopPropagation()
              beginTextEditing(layer)
            }}
            aria-hidden="true"
          >
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
        {isSelected && currentTool === 'select' && hasMultiSelection && !isEditingText && (
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

  const leftToolButtons = (
    <div className="toolbar-tools">
      <div className="toolbar-tools-row">
        <button
          className={currentTool === 'select' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => activateTool('select')}
          aria-label="Select"
        >
          <img className="button-icon" src={pointerIcon} alt="" aria-hidden="true" />
        </button>
        <button
          className={currentTool === 'pen' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => activateTool('pen')}
          aria-label="Pen"
        >
          <img className="button-icon" src={penIcon} alt="" aria-hidden="true" />
        </button>
        <button
          className={currentTool === 'eraser' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => activateTool('eraser')}
          aria-label="Eraser"
        >
          <img className="button-icon" src={eraserIcon} alt="" aria-hidden="true" />
        </button>
        <button
          className={currentTool === 'zoom' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => activateTool('zoom')}
          onDoubleClick={() => setViewport({ zoom: 1, offsetX: 0, offsetY: 0 })}
          aria-label="Zoom"
        >
          <img className="button-icon" src={zoomIcon} alt="" aria-hidden="true" />
        </button>
      </div>
      <div className="toolbar-tools-row">
        <button
          className={currentTool === 'bucket' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => activateTool('bucket')}
          aria-label="Bucket Fill"
        >
          <img className="button-icon" src={bucketIcon} alt="" aria-hidden="true" />
        </button>
        <button
          className={currentTool === 'gradient' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => activateTool('gradient')}
          aria-label="Gradient"
        >
          <img className="button-icon" src={gradientIcon} alt="" aria-hidden="true" />
        </button>
        <button
          className={currentTool === 'lasso' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => activateTool('lasso')}
          aria-label="Lasso"
        >
          <img className="button-icon" src={lassoIcon} alt="" aria-hidden="true" />
        </button>
      </div>
    </div>
  )

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
      {isUnsavedChangesModalOpen && (
        <div
          className="modal-backdrop"
          onPointerDown={handleCancelUnsavedChanges}
          role="presentation"
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved changes"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Unsaved Changes</p>
                <h2>Create New File?</h2>
              </div>
            </div>
            <div className="modal-body single-column">
              <p className="modal-copy">
                You have unsaved changes. Are you sure you want to create a new file without
                saving?
              </p>
            </div>
            <div className="modal-actions">
              <button
                className="action-button"
                type="button"
                onClick={handleCancelUnsavedChanges}
              >
                Cancel
              </button>
              <button
                className="action-button active"
                type="button"
                onClick={handleDiscardAndCreateNew}
              >
                Discard and Create New
              </button>
            </div>
          </div>
        </div>
      )}
      {isNewFileModalOpen && (
        <div
          className="modal-backdrop"
          onPointerDown={handleCancelNewFile}
          role="presentation"
        >
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
                <input
                  type="text"
                  value={newFileNameInput}
                  onChange={(event) => setNewFileNameInput(event.target.value)}
                />
              </label>
              <label className="property-field">
                <span>Width</span>
                <input
                  type="number"
                  min={MIN_DOCUMENT_DIMENSION}
                  step="1"
                  value={newFileWidthInput}
                  onChange={(event) => setNewFileWidthInput(event.target.value)}
                />
              </label>
              <label className="property-field">
                <span>Height</span>
                <input
                  type="number"
                  min={MIN_DOCUMENT_DIMENSION}
                  step="1"
                  value={newFileHeightInput}
                  onChange={(event) => setNewFileHeightInput(event.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="action-button"
                type="button"
                onClick={handleCancelNewFile}
              >
                Cancel
              </button>
              <button
                className="action-button active"
                type="button"
                onClick={handleCreateNewFile}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
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
          {leftToolButtons}
          <div
            className={`tool-panel-error${toolPanelError.isVisible ? ' visible' : ''}${toolPanelError.isFading ? ' fading' : ''}`}
            role="status"
            aria-live="polite"
          >
            {toolPanelError.message}
          </div>
          <div className="toolbar-actions">
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
                  <option value="fg-to-transparent">FG -&gt; Transparent</option>
                </select>
              </label>
            )}
            {currentTool === 'lasso' && (
              <button
                className="action-button"
                type="button"
                disabled={!hasFloatingSelection && !hasActiveLassoSelection}
                onClick={commitFloatingSelectionToNewLayer}
              >
                Sel to Layer
              </button>
            )}
            <div className="history-widget" aria-label="History actions">
              <button
                className="icon-button history-widget-button"
                type="button"
                disabled={!canUndo}
                onClick={undo}
                aria-label="Undo"
              >
                <img className="button-icon" src={undoIcon} alt="" aria-hidden="true" />
              </button>
              <button
                className="icon-button history-widget-button"
                type="button"
                disabled={!canRedo}
                onClick={redo}
                aria-label="Redo"
              >
                <img className="button-icon" src={redoIcon} alt="" aria-hidden="true" />
              </button>
            </div>
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
                    width: `${documentWidth}px`,
                    height: `${documentHeight}px`,
                    transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.zoom * documentScale})`,
                  }}
                >
                  <div
                    ref={canvasSurfaceRef}
                    className="canvas-surface"
                    style={{
                      width: `${documentWidth}px`,
                      height: `${documentHeight}px`,
                    }}
                  >
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

            <section className="panel-card inspector-panel">
                <div className="inspector-panel-body">
                {hasMultiSelection ? (
                  <>
                    <div className="group-note full-width">
                      {selectedLayerIds.length} layers selected. Multi-selection currently supports
                      shared move and scale. Inspector editing remains single-layer only for now.
                    </div>
                    {canLinkSelectedLayers && (
                      <div className="inline-action-row">
                        <button
                          className={selectedPairAlreadyLinked ? 'action-button active' : 'action-button'}
                          type="button"
                          onClick={handleLinkSelectedLayers}
                          disabled={selectedPairAlreadyLinked}
                        >
                          {selectedPairAlreadyLinked ? 'Layers Linked' : 'Link Layers'}
                        </button>
                        <button
                          className="action-button"
                          type="button"
                          onClick={handleUnlinkSelectedLayers}
                          disabled={!selectedPairAlreadyLinked}
                        >
                          Unlink
                        </button>
                      </div>
                    )}
                  </>
                ) : selectedLayer ? (
                  <div className="property-grid">
                    {linkedLayer && (
                      <label className="property-field full-width">
                        <span>Linked To</span>
                        <div className="linked-layer-actions">
                          <strong>{linkedLayer.name}</strong>
                          <button
                            className="action-button"
                            type="button"
                            onClick={handleUnlinkSelectedLayer}
                          >
                            Unlink
                          </button>
                        </div>
                      </label>
                    )}
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
                        <label className="property-field full-width">
                          <span>Alignment</span>
                          <div className="segmented-control" role="group" aria-label="Text alignment">
                            {[
                              { value: 'left', label: 'Left' },
                              { value: 'center', label: 'Center' },
                              { value: 'right', label: 'Right' },
                            ].map((option) => (
                              <button
                                key={option.value}
                                className={(selectedLayer.textAlign ?? 'left') === option.value
                                  ? 'segmented-control-button active'
                                  : 'segmented-control-button'}
                                type="button"
                                onClick={() =>
                                  applyTextLayerUpdate(
                                    selectedLayer.id,
                                    (layer) => updateTextStyle(layer, {
                                      textAlign: option.value,
                                    }),
                                  )
                                }
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </label>
                        <label className="property-field">
                          <span>Letter Spacing</span>
                          <input
                            type="number"
                            step="0.5"
                            value={selectedLayer.letterSpacing ?? 0}
                            onChange={(event) =>
                              applyTextLayerUpdate(
                                selectedLayer.id,
                                (layer) => updateTextStyle(layer, {
                                  letterSpacing: Number(event.target.value) || 0,
                                }),
                              )
                            }
                          />
                        </label>
                        <label className="property-field">
                          <span>Line Height</span>
                          <input
                            type="number"
                            min="0.5"
                            step="0.05"
                            value={selectedLayer.lineHeight ?? 1.15}
                            onChange={(event) =>
                              applyTextLayerUpdate(
                                selectedLayer.id,
                                (layer) => updateTextStyle(layer, {
                                  lineHeight: Math.max(0.5, Number(event.target.value) || 1.15),
                                }),
                              )
                            }
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
                        {!selectedLayer.isTextShadow && selectedLayerShadow && (
                          <>
                            <label className="property-field">
                              <span>Shadow X</span>
                              <input
                                type="number"
                                value={selectedLayerShadow.x - selectedLayer.x}
                                onChange={(event) =>
                                  applyDocumentChange((currentDocument) =>
                                    updateLayer(currentDocument, selectedLayerShadow.id, {
                                      x: selectedLayer.x + (Number(event.target.value) || 0),
                                    }),
                                  )
                                }
                              />
                            </label>
                            <label className="property-field">
                              <span>Shadow Y</span>
                              <input
                                type="number"
                                value={selectedLayerShadow.y - selectedLayer.y}
                                onChange={(event) =>
                                  applyDocumentChange((currentDocument) =>
                                    updateLayer(currentDocument, selectedLayerShadow.id, {
                                      y: selectedLayer.y + (Number(event.target.value) || 0),
                                    }),
                                  )
                                }
                              />
                            </label>
                            <label className="property-field">
                              <span>Shadow Opacity</span>
                              <input
                                type="number"
                                min="0"
                                max="1"
                                step="0.05"
                                value={selectedLayerShadow.opacity}
                                onChange={(event) =>
                                  applyDocumentChange((currentDocument) =>
                                    updateLayer(currentDocument, selectedLayerShadow.id, {
                                      opacity: Math.max(0, Math.min(1, Number(event.target.value) || 0)),
                                    }),
                                  )
                                }
                              />
                            </label>
                          </>
                        )}
                        {!selectedLayer.isTextShadow && (
                          <label className="property-field full-width">
                            <span>Text Shadow</span>
                            <button
                              className={selectedLayerShadow ? 'action-button active' : 'action-button'}
                              type="button"
                              onClick={handleAddTextShadow}
                            >
                              Add Shadow
                            </button>
                          </label>
                        )}
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
                      </>
                    )}

                    {selectedLayer.type === 'raster' && (
                      <div className="group-note full-width">
                        Drawing layers support alpha lock, and each pen stroke still commits as a
                        single bitmap history step.
                      </div>
                    )}

                  </div>
                ) : (
                  <p className="empty-state">
                    Select a layer from the canvas or the stack to edit its properties.
                  </p>
                )}
                </div>
              </section>
          </aside>
        </div>
      </section>
    </main>
  )
}

export default App
