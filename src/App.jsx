import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import addImageIcon from './assets/add image.svg'
import penTabIcon from './assets/pen.svg'
import shareTabIcon from './assets/share.svg'
import { AddLayerPanel } from './components/editor/AddLayerPanel'
import { AssetLibraryPanel } from './components/editor/AssetLibraryPanel'
import { EditorToolbar } from './components/editor/EditorToolbar'
import { ExternalImageDropOverlay } from './components/editor/ExternalImageDropOverlay'
import { FileMenu } from './components/editor/FileMenu'
import { FontSizeStepper } from './components/editor/FontSizeStepper'
import { LayerFlipControls } from './components/editor/LayerFlipControls'
import { LayerPanel } from './components/editor/LayerPanel'
import { PostSidebar } from './components/editor/PostSidebar'
import { PromptShell } from './components/editor/PromptShell'
import { NewFileModal } from './components/editor/modals/NewFileModal'
import { SettingsModal } from './components/editor/modals/SettingsModal'
import { UnsavedChangesModal } from './components/editor/modals/UnsavedChangesModal'
import {
  ASSET_DRAG_MIME_TYPE,
  DEFAULT_BUCKET_TOLERANCE,
  DEFAULT_ERASER_SIZE,
  DEFAULT_PEN_SIZE,
  DEFAULT_TEXT_SHADOW_OFFSET_X,
  DEFAULT_TEXT_SHADOW_OFFSET_Y,
  DEFAULT_TEXT_SHADOW_OPACITY,
  HANDLE_DIRECTIONS,
  MAX_ASSET_LIBRARY_ITEMS,
  MAX_FONT_SIZE,
  MAX_LAYER_SIZE,
  MAX_LETTER_SPACING,
  MAX_LINE_HEIGHT,
  MAX_STAGE_DISPLAY_HEIGHT,
  MAX_STAGE_DISPLAY_WIDTH,
  MAX_VIEWPORT_ZOOM,
  MIN_FONT_SIZE,
  MIN_DOCUMENT_DIMENSION,
  MIN_LAYER_HEIGHT,
  MIN_LAYER_WIDTH,
  MIN_VIEWPORT_ZOOM,
  NO_LAYERS_TOOL_ERROR_MESSAGE,
  RESIZE_HANDLE_HIT_PADDING_PX,
  RESIZE_HANDLE_VISIBLE_SIZE_PX,
  TOOL_PANEL_ERROR_DURATION_MS,
  TOOL_PANEL_ERROR_FADE_DELAY_MS,
  VIEWPORT_ZOOM_STEP,
} from './editor/constants'
import {
  applyInspectorSizeToLayer,
  createExactTextLayerFromJsonSpec,
  getDefaultImageLayerFormValues,
  getDefaultTextLayerFormValues,
  createImageLayerFromAddSpec,
  createTextLayerFromAddSpec,
  normalizeImageLayerSpecFromForm,
  normalizeTextLayerSpecFromForm,
  parseAddLayerJson,
} from './editor/addLayerPanelHelpers'
import {
  createValidatedImportedImageLayer,
  createBitmapEditableLayerPatch,
  createImageLayerBitmapPatch,
  createInitialDocument,
  DEFAULT_IMPORT_TRIM_ALPHA_THRESHOLD,
  DEFAULT_IMPORT_TRIM_PADDING,
  getDocumentFilenameBase,
  getImportedImageDimensions,
  normalizeNewFileDimensionInput,
  normalizeNewFileNameInput,
  shouldTrimTransparentImport,
} from './editor/documentHelpers'
import { getEditorIcons } from './editor/iconAssets'
import { useCoalescedHistorySession } from './hooks/useCoalescedHistorySession'
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
  getFloatingSelectionSourceOffset,
  isPointInsideFloatingSelection,
  isPointInsidePolygon,
  renderFloatingSelection,
  renderLassoSelection,
} from './lib/lassoTool'
import {
  createRectFromPoints,
  isPointInsideRect,
  rectToBounds,
  renderRectSelection,
  withRectClip,
} from './lib/rectSelectTool'
import {
  appendLayer,
  canLayerLockTransparentPixels,
  canMergeDown,
  clearSelection,
  cloneLayer,
  DEFAULT_DOCUMENT_NAME,
  DEFAULT_DOCUMENT_HEIGHT,
  DEFAULT_DOCUMENT_WIDTH,
  createRasterLayer,
  createTextShadowLayer,
  createTextLayer,
  findLayer,
  flipLayerHorizontal,
  flipLayerVertical,
  getLayerBelow,
  getSelectedLayers,
  isAlphaLocked,
  isErasableLayer,
  insertLayer,
  isSvgImageLayer,
  isRasterLayer,
  clampLayerCornerRadius,
  linkLayerPair,
  mergeLayerDown,
  moveLayerToIndex,
  removeLayers,
  selectSingleLayer,
  setLayerAlphaLock,
  toggleLayerInSelection,
  unlinkLayerPair,
  updateLayer,
  isLayerSelected,
} from './lib/layers'
import {
  centerToTopLeft,
  getLayerTopLeft,
  getLayerTransformBounds,
  layerLocalPointToDocumentPoint,
  toLayerLocalPoint,
  topLeftToCenter,
} from './lib/layerGeometry'
import {
  applyEraseMask,
  applyLinearGradientToCanvas,
  canvasToBitmap,
  cloneCanvas,
  composeTextLayerCanvases,
  createSizedCanvas,
  createMaskedCanvas,
  createCanvasFromSource,
  expandBitmapSurfaceToFitBounds,
  createTransparentCanvas,
  createMaskCanvasFromSource,
  createEmptyMaskCanvas,
  floodFillCanvas,
  inferImageSourceKindFromSrc,
  hasVisibleCanvasPixelNearby,
  loadImageDimensionsFromSource,
  paintCanvas,
  readFileAsDataUrl,
  renderTextLayerToCanvas,
  trimImageSourceTransparentBounds,
} from './lib/raster'
import { getFittedStageMetrics, screenToWorld, worldToScreen, zoomAtPoint } from './lib/viewport'
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
  applyTextStyleToRange,
  detectTextDirection,
  getTextEditorOverlayGeometry,
  getUniformTextStyleValueForRange,
  isTextRangeFullyBold,
  loadTextLayerFont,
  resizeBoxText,
  resizePointTextTransform,
  updateTextContent,
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
  loadCurrentDocumentFromStorage,
  normalizeDocumentState,
  parseProjectFile,
  saveCurrentDocumentToStorage,
  serializeProjectFile,
} from './lib/documentFiles'

function isSupportedAssetFile(file) {
  return Boolean(file) && /^image\/(png|jpeg|jpg|svg\+xml|webp)$/i.test(file.type)
}

const PIXEL_HIT_PADDING = 4
const VISIBLE_PIXEL_ALPHA_THRESHOLD = 8
const THEME_STORAGE_KEY = 'fukmall.theme'
const TRIM_TRANSPARENT_IMPORTS_STORAGE_KEY = 'fukmall.trim-transparent-imports'
const INSPECTOR_ADJUSTMENT_IDLE_MS = 450
const DEFAULT_EDITOR_CHROME_ENABLED = false
const PLACEHOLDER_POST_SIDEBAR_POSTS = [
  {
    id: 'morning-drop',
    title: 'Morning drop',
    subtitle: 'Carousel concept',
    detail: 'Draft',
    thumbnailLabel: 'MD',
    thumbnailBackground: 'linear-gradient(135deg, rgba(217, 119, 6, 0.26), rgba(15, 118, 110, 0.18))',
  },
  {
    id: 'linen-story',
    title: 'Linen story',
    subtitle: 'Caption polish',
    detail: '4h',
    thumbnailLabel: 'LS',
    thumbnailBackground: 'linear-gradient(135deg, rgba(15, 118, 110, 0.2), rgba(255, 255, 255, 0.72))',
  },
  {
    id: 'soft-launch',
    title: 'Soft launch',
    subtitle: 'Product highlight',
    detail: 'Tue',
    thumbnailLabel: 'SL',
    thumbnailBackground: 'linear-gradient(135deg, rgba(244, 114, 182, 0.18), rgba(217, 119, 6, 0.18))',
  },
  {
    id: 'weekend-edit',
    title: 'Weekend edit',
    subtitle: 'Visual notes',
    detail: 'Apr 18',
    thumbnailLabel: 'WE',
    thumbnailBackground: 'linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(15, 118, 110, 0.16))',
  },
]

function createStartupState() {
  const savedDocument = loadCurrentDocumentFromStorage()

  return {
    document: savedDocument
      ?? createInitialDocument(DEFAULT_DOCUMENT_WIDTH, DEFAULT_DOCUMENT_HEIGHT),
    isFirstEntryCanvasVisible: savedDocument == null,
  }
}

function loadThemeFromStorage() {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return savedTheme === 'dark' ? 'dark' : 'light'
}

function loadTrimTransparentImportsFromStorage() {
  if (typeof window === 'undefined') {
    return true
  }

  return window.localStorage.getItem(TRIM_TRANSPARENT_IMPORTS_STORAGE_KEY) !== 'false'
}

function navigateTo(pathname) {
  if (typeof window === 'undefined') {
    return
  }

  window.history.pushState({}, '', pathname)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function getSupportedImageFiles(files) {
  return Array.from(files ?? []).filter(isSupportedAssetFile)
}

function isInternalAssetDrag(dataTransfer) {
  return Boolean(dataTransfer?.types?.includes(ASSET_DRAG_MIME_TYPE))
}

function hasSupportedExternalImageDrag(dataTransfer) {
  if (!dataTransfer || isInternalAssetDrag(dataTransfer)) {
    return false
  }

  const items = Array.from(dataTransfer.items ?? [])

  if (items.length > 0) {
    return items.some((item) => (
      item.kind === 'file' &&
      /^image\/(png|jpeg|jpg|svg\+xml|webp)$/i.test(item.type)
    ))
  }

  return getSupportedImageFiles(dataTransfer.files).length > 0
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

function clampFontSizeInputValue(value) {
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(Number(value) || 0)))
}

function clampLetterSpacingInputValue(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return 0
  }

  return Math.min(MAX_LETTER_SPACING, numericValue)
}

function clampLineHeightInputValue(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return 1.15
  }

  return Math.max(0.5, Math.min(MAX_LINE_HEIGHT, numericValue))
}

function getAssetLibraryLimitMessage(acceptedCount, rejectedCount) {
  if (acceptedCount > 0 && rejectedCount > 0) {
    return `Asset library limit reached. Added ${acceptedCount} asset${acceptedCount === 1 ? '' : 's'}; ${rejectedCount} ${rejectedCount === 1 ? 'was' : 'were'} not imported.`
  }

  return 'Asset library limit reached. Remove an asset before importing more.'
}

async function importAssetsFromFiles(files) {
  const supportedFiles = getSupportedImageFiles(files)
  const settledImports = await Promise.allSettled(supportedFiles.map(async (file) => {
    const src = await readFileAsDataUrl(file)
    const sourceKind = getImportedSourceKind(file, src)
    const resolvedDimensions = await loadImageDimensionsFromSource(src)
    const dimensions = getImportedImageDimensions(
      resolvedDimensions.width,
      resolvedDimensions.height,
    )

    if (!dimensions) {
      throw new Error(`Image source could not be loaded: ${file.name}`)
    }

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

  return settledImports.reduce((result, entry, index) => {
    if (entry.status === 'fulfilled') {
      result.assets.push(entry.value)
      return result
    }

    result.errors.push(
      entry.reason instanceof Error
        ? entry.reason.message
        : `Image source could not be loaded: ${supportedFiles[index]?.name ?? 'Unknown image'}`,
    )
    return result
  }, {
    assets: [],
    errors: [],
  })
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
    centerX: minX + (Math.max(1, maxX - minX) / 2),
    centerY: minY + (Math.max(1, maxY - minY) / 2),
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

function scaleSignedLayerAxis(scale, ratio, maximumMagnitude) {
  const normalizedScale = Number(scale)
  const scaleSign = normalizedScale < 0 ? -1 : 1
  const magnitude = clampValue(
    Math.abs(Number.isFinite(normalizedScale) ? normalizedScale : 1) * ratio,
    0.1,
    maximumMagnitude,
  )

  return scaleSign * magnitude
}

function scaleLayerAroundOwnCenter(layer, ratioX, ratioY) {
  if (!layer) {
    return layer
  }

  if (layer.type === 'text') {
    if (layer.mode === 'box') {
      const nextWidth = clampValue(layer.width * ratioX, MIN_LAYER_WIDTH, MAX_LAYER_SIZE)
      const nextHeight = clampValue(layer.height * ratioY, MIN_LAYER_HEIGHT, MAX_LAYER_SIZE)

      return resizeBoxText(
        {
          ...layer,
          x: layer.x,
          y: layer.y,
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
        scaleSignedLayerAxis(layer.scaleX, ratioX, maximumScaleX),
        scaleSignedLayerAxis(layer.scaleY, ratioY, maximumScaleY),
      ),
      width: layer.measuredWidth ?? layer.width,
      height: layer.measuredHeight ?? layer.height,
    }
  }

  const nextWidth = clampValue(layer.width * ratioX, MIN_LAYER_WIDTH, MAX_LAYER_SIZE)
  const nextHeight = clampValue(layer.height * ratioY, MIN_LAYER_HEIGHT, MAX_LAYER_SIZE)

  return {
    ...layer,
    x: layer.x,
    y: layer.y,
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
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

function isSelectionPreservingUiTarget(target) {
  return target instanceof HTMLElement && (
    isEditableTarget(target) ||
    target.closest('.sidebar, .inspector-panel, .inspector-panel-body, .canvas-caption-area') ||
    target.closest(
      'button, a, label, select, option, summary, [role="button"], [role="dialog"], .modal-backdrop',
    )
  )
}

function isTextEditingPreservingUiTarget(target) {
  return target instanceof HTMLElement && Boolean(
    target.closest('.text-layer-editor, [data-text-style-control="true"]'),
  )
}

function isResizeHandleTarget(target) {
  return target instanceof HTMLElement && Boolean(target.closest('.resize-handle'))
}

function isSelectionFrameTarget(target) {
  return target instanceof HTMLElement && Boolean(
    target.closest('.selection-frame, .shared-selection-frame'),
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

function getHandleLocalPoint(handle, width, height) {
  return {
    x: handle.x === -1 ? 0 : handle.x === 1 ? width : width / 2,
    y: handle.y === -1 ? 0 : handle.y === 1 ? height : height / 2,
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

function createSurfaceCoverageBoundsFromPoints(...points) {
  const validPoints = points.filter((point) => (
    Number.isFinite(point?.x) &&
    Number.isFinite(point?.y)
  ))

  if (validPoints.length === 0) {
    return null
  }

  return {
    minX: Math.min(...validPoints.map((point) => point.x)),
    minY: Math.min(...validPoints.map((point) => point.y)),
    maxX: Math.max(...validPoints.map((point) => point.x)),
    maxY: Math.max(...validPoints.map((point) => point.y)),
  }
}

function hasReachedCanvasBoundary(reachedBoundary) {
  return Boolean(
    reachedBoundary?.left ||
    reachedBoundary?.top ||
    reachedBoundary?.right ||
    reachedBoundary?.bottom
  )
}

function getBucketFillExpansionCoverageBounds(
  layer,
  surfaceCanvas,
  reachedBoundary,
  documentWidth,
  documentHeight,
) {
  if (!layer || !surfaceCanvas || !hasReachedCanvasBoundary(reachedBoundary)) {
    return null
  }

  const surfaceScaleX = surfaceCanvas.width / Math.max(layer.width, 1)
  const surfaceScaleY = surfaceCanvas.height / Math.max(layer.height, 1)
  const layerTopLeft = getLayerTopLeft(layer)
  const expandLeft = reachedBoundary.left
    ? Math.max(0, layerTopLeft.x) * surfaceScaleX
    : 0
  const expandTop = reachedBoundary.top
    ? Math.max(0, layerTopLeft.y) * surfaceScaleY
    : 0
  const expandRight = reachedBoundary.right
    ? Math.max(0, documentWidth - (layerTopLeft.x + layer.width)) * surfaceScaleX
    : 0
  const expandBottom = reachedBoundary.bottom
    ? Math.max(0, documentHeight - (layerTopLeft.y + layer.height)) * surfaceScaleY
    : 0

  if (expandLeft <= 0 && expandTop <= 0 && expandRight <= 0 && expandBottom <= 0) {
    return null
  }

  return {
    minX: -expandLeft,
    minY: -expandTop,
    maxX: surfaceCanvas.width + expandRight,
    maxY: surfaceCanvas.height + expandBottom,
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

function isPointInsideTextEditRegion(layer, documentPoint) {
  if (!documentPoint || layer?.type !== 'text' || !layer.visible) {
    return false
  }

  const localPoint = toLayerLocalPoint(layer, documentPoint)

  return isPointInsideLayerFrame(layer, localPoint)
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

function getRectSelectionPoints(rect) {
  if (!rect) {
    return []
  }

  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]
}

function constrainRectSelectionToSquare(startPoint, endPoint) {
  const deltaX = endPoint.x - startPoint.x
  const deltaY = endPoint.y - startPoint.y
  const side = Math.min(Math.abs(deltaX), Math.abs(deltaY))

  return {
    x: startPoint.x + (Math.sign(deltaX) || 1) * side,
    y: startPoint.y + (Math.sign(deltaY) || 1) * side,
  }
}

function createDocumentSelectionFromRect(rect, sourceLayerId = null) {
  const finalizedSelection = finalizeLassoSelection(getRectSelectionPoints(rect))

  if (!finalizedSelection) {
    return null
  }

  return {
    ...finalizedSelection,
    ...(sourceLayerId ? { sourceLayerId } : {}),
  }
}

function applyRectSelectionToCanvas(nextCanvas, originalCanvas, rect) {
  const bounds = rectToBounds(rect)

  if (!nextCanvas || !originalCanvas || !bounds || bounds.width <= 0 || bounds.height <= 0) {
    return nextCanvas
  }

  const outputCanvas = cloneCanvas(originalCanvas)
  const context = outputCanvas.getContext('2d')

  if (!context) {
    return nextCanvas
  }

  context.drawImage(
    nextCanvas,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
  )

  return outputCanvas
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

function getFallbackSelectedLayerId(documentState, preferredLayerId = null) {
  if (!documentState.layers.length) {
    return null
  }

  if (preferredLayerId && findLayer(documentState, preferredLayerId)) {
    return preferredLayerId
  }

  return documentState.layers.at(-1)?.id ?? null
}

function App({ editorChromeEnabled = DEFAULT_EDITOR_CHROME_ENABLED } = {}) {
  const startupState = useMemo(() => createStartupState(), [])
  const appShellRef = useRef(null)
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
  const fontSizeInputRef = useRef(null)
  const textSelectionRef = useRef({ start: 0, end: 0 })
  const textSelectionRestoreRef = useRef(null)
  const preserveTextEditingBlurRef = useRef(false)
  const externalImageDragDepthRef = useRef(0)
  const hasShownAutosaveErrorRef = useRef(false)
  const toolPanelErrorFadeTimeoutRef = useRef(null)
  const toolPanelErrorClearTimeoutRef = useRef(null)
  const addLayerPanelStatusTimeoutRef = useRef(null)
  const {
    present: documentState,
    commit: commitHistory,
    setTransient,
    commitTransientChange,
    undo: undoHistory,
    redo: redoHistory,
    reset: resetHistory,
    canUndo,
    canRedo,
  } = useHistory(startupState.document)
  const documentStateRef = useRef(documentState)
  documentStateRef.current = documentState
  const {
    applyCoalescedUpdate,
    finishSession: finishCoalescedInspectorAdjustment,
    hasActiveSession,
  } = useCoalescedHistorySession({
    commitTransientChange,
    inactivityTimeoutMs: INSPECTOR_ADJUSTMENT_IDLE_MS,
  })
  const commit = useCallback((updater) => {
    finishCoalescedInspectorAdjustment()
    commitHistory((currentDocument) => updater(currentDocument))
  }, [commitHistory, finishCoalescedInspectorAdjustment])
  const applyDocumentChange = useCallback((updater) => {
    commit((currentDocument) => updater(currentDocument))
  }, [commit])
  const undo = useCallback(() => {
    finishCoalescedInspectorAdjustment()
    undoHistory()
  }, [finishCoalescedInspectorAdjustment, undoHistory])
  const redo = useCallback(() => {
    finishCoalescedInspectorAdjustment()
    redoHistory()
  }, [finishCoalescedInspectorAdjustment, redoHistory])
  const reset = useCallback((nextState) => {
    finishCoalescedInspectorAdjustment()
    resetHistory(nextState)
  }, [finishCoalescedInspectorAdjustment, resetHistory])
  const [savedDocumentSignature, setSavedDocumentSignature] = useState(() => (
    serializeProjectFile(documentState)
  ))
  const [isFirstEntryCanvasVisible, setIsFirstEntryCanvasVisible] = useState(
    () => startupState.isFirstEntryCanvasVisible,
  )
  const [activeSidebarPostId, setActiveSidebarPostId] = useState(
    () => PLACEHOLDER_POST_SIDEBAR_POSTS[0]?.id ?? null,
  )
  const [editingTextLayerId, setEditingTextLayerId] = useState(null)
  const [textDraft, setTextDraft] = useState('')
  const [textEditorSelection, setTextEditorSelection] = useState({ start: 0, end: 0 })
  const [fontSizeInputDraft, setFontSizeInputDraft] = useState(null)
  const fontSizeInputDraftRef = useRef(null)
  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false)
  const [isUnsavedChangesModalOpen, setIsUnsavedChangesModalOpen] = useState(false)
  const [newFileNameInput, setNewFileNameInput] = useState(DEFAULT_DOCUMENT_NAME)
  const [newFileWidthInput, setNewFileWidthInput] = useState(String(DEFAULT_DOCUMENT_WIDTH))
  const [newFileHeightInput, setNewFileHeightInput] = useState(String(DEFAULT_DOCUMENT_HEIGHT))
  const [toolPanelError, setToolPanelError] = useState({
    message: '',
    isRendered: false,
    isVisible: false,
    isFading: false,
  })
  const [activeTool, setActiveTool] = useState('select')
  const [theme, setTheme] = useState(() => loadThemeFromStorage())
  const [trimTransparentImports, setTrimTransparentImports] = useState(
    () => loadTrimTransparentImportsFromStorage(),
  )
  const [globalColors, setGlobalColors] = useState(() => loadColorsFromStorage())
  const [penSize, setPenSize] = useState(DEFAULT_PEN_SIZE)
  const [eraserSize, setEraserSize] = useState(DEFAULT_ERASER_SIZE)
  const [bucketTolerance, setBucketTolerance] = useState(DEFAULT_BUCKET_TOLERANCE)
  const [gradientMode, setGradientMode] = useState('bg-to-fg')
  const [gradientPreview, setGradientPreview] = useState(null)
  const [lassoSelection, setLassoSelection] = useState(null)
  const [rectSelection, setRectSelection] = useState(null)
  const [floatingSelection, setFloatingSelection] = useState(null)
  const [draggedLayerId, setDraggedLayerId] = useState(null)
  const [layerDropTarget, setLayerDropTarget] = useState(null)
  const [assetLibrary, setAssetLibrary] = useState([])
  const [addLayerJsonInput, setAddLayerJsonInput] = useState('')
  const [addLayerPanelStatus, setAddLayerPanelStatus] = useState({ message: '', tone: 'info' })
  const [addLayerPanelType, setAddLayerPanelType] = useState('text')
  const [addLayerTextCreationSource, setAddLayerTextCreationSource] = useState('manual')
  const [addLayerTextFormValues, setAddLayerTextFormValues] = useState(() => (
    getDefaultTextLayerFormValues()
  ))
  const [addLayerImageFormValues, setAddLayerImageFormValues] = useState(() => (
    getDefaultImageLayerFormValues()
  ))
  const [draggedAssetId, setDraggedAssetId] = useState(null)
  const [activeSvgToolLayerId, setActiveSvgToolLayerId] = useState(null)
  const [isCanvasAssetDropActive, setIsCanvasAssetDropActive] = useState(false)
  const [isExternalImageDragActive, setIsExternalImageDragActive] = useState(false)
  const [isSnapEnabled] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [isOpeningFile, setIsOpeningFile] = useState(false)
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [activeMoveGuides, setActiveMoveGuides] = useState(() => createEmptySnapGuides())
  const [viewport, setViewport] = useState({
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  })
  const resetExternalImageDragState = useCallback(() => {
    externalImageDragDepthRef.current = 0
    setIsExternalImageDragActive(false)
  }, [])

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
  const editorIcons = useMemo(() => getEditorIcons(theme), [theme])
  const currentDocumentSignature = useMemo(() => serializeProjectFile(documentState), [documentState])
  const hasUnsavedChanges = currentDocumentSignature !== savedDocumentSignature
  const stageMetrics = useMemo(() => getFittedStageMetrics(
    documentWidth,
    documentHeight,
    MAX_STAGE_DISPLAY_WIDTH,
    MAX_STAGE_DISPLAY_HEIGHT,
  ), [documentHeight, documentWidth])
  const documentScale = stageMetrics.scale
  const stageLayoutStyle = {
    '--stage-display-width': `${stageMetrics.width}px`,
    '--stage-display-height': `${stageMetrics.height}px`,
  }
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
  const hasActiveInspectorAdjustment = hasActiveSession()
  const currentTool = activeTool
  const activeBrushTool = currentTool === 'eraser' ? 'eraser' : 'pen'
  const hasActiveLassoSelection = Boolean(lassoSelection?.isClosed)
  const hasActiveRectSelection = Boolean(rectSelection?.rect && !rectSelection?.isDragging)
  const hasFloatingSelection = Boolean(floatingSelection)
  const resizeHandleStyleVars = {
    '--resize-handle-visible-size': `${RESIZE_HANDLE_VISIBLE_SIZE_PX}px`,
    '--resize-handle-hit-padding': `${RESIZE_HANDLE_HIT_PADDING_PX}px`,
    '--resize-handle-scale-x': '1',
    '--resize-handle-scale-y': '1',
  }
  const selectedResizeHandleStyleVars = selectedLayer
    ? {
      ...resizeHandleStyleVars,
      '--resize-handle-scale-x': String(Math.max(Math.abs(selectedLayer.scaleX ?? 1), 0.0001)),
      '--resize-handle-scale-y': String(Math.max(Math.abs(selectedLayer.scaleY ?? 1), 0.0001)),
    }
    : resizeHandleStyleVars

  function getActiveSelectionResizeHandleHit(event) {
    if (currentTool !== 'select' || editingTextLayerId || !canvasRef.current) {
      return null
    }

    const pointerPosition = getPointerPositionWithinElement(event, canvasRef.current)

    if (!pointerPosition) {
      return null
    }

    const effectiveViewport = {
      ...viewport,
      zoom: viewport.zoom * documentScale,
    }
    const screenHitRadius = (
      (RESIZE_HANDLE_VISIBLE_SIZE_PX + (RESIZE_HANDLE_HIT_PADDING_PX * 2)) *
      effectiveViewport.zoom
    ) / 2

    if (screenHitRadius <= 0) {
      return null
    }

    if (selectedLayers.length > 1 && selectionBounds) {
      for (const handle of HANDLE_DIRECTIONS) {
        const handlePoint = {
          x: handle.x === -1
            ? selectionBounds.x
            : handle.x === 1
              ? selectionBounds.x + selectionBounds.width
              : selectionBounds.x + (selectionBounds.width / 2),
          y: handle.y === -1
            ? selectionBounds.y
            : handle.y === 1
              ? selectionBounds.y + selectionBounds.height
              : selectionBounds.y + (selectionBounds.height / 2),
        }
        const handleScreenPoint = worldToScreen(
          handlePoint.x,
          handlePoint.y,
          effectiveViewport,
        )

        if (
          Math.abs(pointerPosition.x - handleScreenPoint.x) <= screenHitRadius &&
          Math.abs(pointerPosition.y - handleScreenPoint.y) <= screenHitRadius
        ) {
          return {
            layer: selectedLayer ?? selectedLayers.at(-1) ?? null,
            handle,
          }
        }
      }

      return null
    }

    if (!selectedLayer) {
      return null
    }

    for (const handle of HANDLE_DIRECTIONS) {
      const localPoint = getHandleLocalPoint(handle, selectedLayer.width, selectedLayer.height)
      const handlePoint = layerLocalPointToDocumentPoint(
        selectedLayer,
        selectedLayer.width,
        selectedLayer.height,
        localPoint,
      )

      if (!handlePoint) {
        continue
      }

      const handleScreenPoint = worldToScreen(
        handlePoint.x,
        handlePoint.y,
        effectiveViewport,
      )

      if (
        Math.abs(pointerPosition.x - handleScreenPoint.x) <= screenHitRadius &&
        Math.abs(pointerPosition.y - handleScreenPoint.y) <= screenHitRadius
      ) {
        return {
          layer: selectedLayer,
          handle,
        }
      }
    }

    return null
  }

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

  const clearAddLayerPanelStatusTimer = useCallback(() => {
    if (addLayerPanelStatusTimeoutRef.current) {
      window.clearTimeout(addLayerPanelStatusTimeoutRef.current)
      addLayerPanelStatusTimeoutRef.current = null
    }
  }, [])

  const showAddLayerPanelStatus = useCallback((message, tone = 'info') => {
    clearAddLayerPanelStatusTimer()
    setAddLayerPanelStatus({ message, tone })

    addLayerPanelStatusTimeoutRef.current = window.setTimeout(() => {
      setAddLayerPanelStatus({ message: '', tone: 'info' })
      addLayerPanelStatusTimeoutRef.current = null
    }, 4000)
  }, [clearAddLayerPanelStatusTimer])

  const showToolPanelError = useCallback((message) => {
    clearToolPanelErrorTimers()
    setToolPanelError({
      message,
      isRendered: true,
      isVisible: true,
      isFading: false,
    })
  }, [clearToolPanelErrorTimers])

  const dismissToolPanelError = useCallback(() => {
    clearToolPanelErrorTimers()
    setToolPanelError({
      message: '',
      isRendered: false,
      isVisible: false,
      isFading: false,
    })
  }, [clearToolPanelErrorTimers])

  useEffect(() => (
    () => {
      clearAddLayerPanelStatusTimer()
    }
  ), [clearAddLayerPanelStatusTimer])

  useEffect(() => {
    if (!toolPanelError.isRendered) {
      clearToolPanelErrorTimers()
      return undefined
    }

    if (toolPanelError.isFading) {
      toolPanelErrorClearTimeoutRef.current = window.setTimeout(() => {
        setToolPanelError({
          message: '',
          isRendered: false,
          isVisible: false,
          isFading: false,
        })
        toolPanelErrorClearTimeoutRef.current = null
      }, TOOL_PANEL_ERROR_DURATION_MS - TOOL_PANEL_ERROR_FADE_DELAY_MS)
    } else {
      toolPanelErrorFadeTimeoutRef.current = window.setTimeout(() => {
        setToolPanelError((currentValue) => (
          currentValue.isRendered
            ? {
              ...currentValue,
              isVisible: false,
              isFading: true,
            }
            : currentValue
        ))
        toolPanelErrorFadeTimeoutRef.current = null
      }, TOOL_PANEL_ERROR_FADE_DELAY_MS)
    }

    return clearToolPanelErrorTimers
  }, [
    clearToolPanelErrorTimers,
    toolPanelError.isFading,
    toolPanelError.isRendered,
  ])

  useEffect(() => {
    setFontSizeDraftValue(null)
  }, [editingTextLayerId, selectedLayer?.id, textEditorSelection.end, textEditorSelection.start])

  const activateTool = useCallback((nextTool) => {
    setActiveTool(nextTool)

    if (nextTool === 'lasso') {
      setRectSelection(null)

      if (floatingSelection?.selectionKind === 'rect') {
        setFloatingSelection(null)
      }
    }

    if (nextTool === 'rectSelect') {
      setLassoSelection(null)

      if (floatingSelection?.selectionKind === 'lasso') {
        setFloatingSelection(null)
      }
    }

    if (!['rectSelect', 'pen', 'eraser', 'bucket', 'gradient'].includes(nextTool)) {
      setRectSelection(null)

      if (floatingSelection?.selectionKind === 'rect') {
        setFloatingSelection(null)
      }
    }

    if (
      !documentState.layers.length &&
      ['pen', 'eraser', 'bucket', 'gradient'].includes(nextTool)
    ) {
      showToolPanelError(NO_LAYERS_TOOL_ERROR_MESSAGE)
    }
  }, [documentState.layers.length, floatingSelection, showToolPanelError])

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

  function setFontSizeDraftValue(nextValue) {
    fontSizeInputDraftRef.current = nextValue
    setFontSizeInputDraft(nextValue)
  }

  function clearTextEditingSessionState() {
    setEditingTextLayerId(null)
    setTextDraft('')
    setTextEditorSelection({ start: 0, end: 0 })
    setFontSizeDraftValue(null)
    textSelectionRef.current = { start: 0, end: 0 }
    textSelectionRestoreRef.current = null
    preserveTextEditingBlurRef.current = false
    interactionRef.current = null
  }

  const syncTextEditorSelection = useCallback((textarea) => {
    if (!textarea) {
      return
    }

    const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length
    const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : start

    textSelectionRef.current = {
      start: Math.max(0, Math.min(start, textarea.value.length)),
      end: Math.max(0, Math.min(end, textarea.value.length)),
    }
    setTextEditorSelection((currentSelection) => (
      currentSelection.start === textSelectionRef.current.start &&
      currentSelection.end === textSelectionRef.current.end
        ? currentSelection
        : { ...textSelectionRef.current }
    ))
  }, [])

  const restoreTextEditorSelection = useCallback((fallbackSelection = null) => {
    window.requestAnimationFrame(() => {
      const textarea = textEditorRef.current

      if (!textarea || editingTextLayerId === null) {
        return
      }

      const nextSelection = fallbackSelection ??
        textSelectionRestoreRef.current ??
        textSelectionRef.current ?? {
          start: textarea.value.length,
          end: textarea.value.length,
        }
      const start = Math.max(0, Math.min(nextSelection.start ?? textarea.value.length, textarea.value.length))
      const end = Math.max(0, Math.min(nextSelection.end ?? start, textarea.value.length))

      textarea.focus()
      textarea.setSelectionRange(start, end)
      syncTextEditorSelection(textarea)
      textSelectionRestoreRef.current = null
      preserveTextEditingBlurRef.current = false
    })
  }, [editingTextLayerId, syncTextEditorSelection])

  useEffect(() => {
    if (!editingTextLayerId || !textEditorRef.current) {
      return
    }

    const textarea = textEditorRef.current
    const selectionIndex = textarea.value.length

    textSelectionRef.current = {
      start: selectionIndex,
      end: selectionIndex,
    }
    setTextEditorSelection({
      start: selectionIndex,
      end: selectionIndex,
    })
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
        styleRanges: layer.styleRanges ?? [],
        textStrokeColor: layer.textStrokeColor ?? layer.strokeColor ?? '',
        textStrokeWidth: layer.textStrokeWidth ?? layer.strokeWidth ?? 0,
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
      await loadTextLayerFont(layer)
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
      layer.x - offsetX,
      layer.y - offsetY,
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
      if (layer.type === 'image') {
        const cornerRadius = clampLayerCornerRadius(layer.width, layer.height, layer.cornerRadius ?? 0)

        if (cornerRadius > 0) {
          drawRoundedRect(context, layer.width, layer.height, cornerRadius)
          context.clip()
        }
      }

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
      ...topLeftToCenter(bounds.minX, bounds.minY, mergedWidth, mergedHeight),
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
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      TRIM_TRANSPARENT_IMPORTS_STORAGE_KEY,
      trimTransparentImports ? 'true' : 'false',
    )
  }, [trimTransparentImports])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (isFirstEntryCanvasVisible) {
      return
    }

    const savedSuccessfully = saveCurrentDocumentToStorage(documentState, window.localStorage)

    if (savedSuccessfully) {
      hasShownAutosaveErrorRef.current = false
      return
    }

    if (!hasShownAutosaveErrorRef.current) {
      hasShownAutosaveErrorRef.current = true
      showToolPanelError('Current document could not be autosaved locally.')
    }
  }, [documentState, isFirstEntryCanvasVisible, showToolPanelError])

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

    if (rectSelection && !findLayer(documentState, rectSelection.sourceLayerId)) {
      setRectSelection(null)
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
  }, [
    documentState,
    floatingSelection,
    gradientPreview,
    lassoSelection,
    rectSelection,
    selectedLayerIds,
    setTransient,
  ])

  useEffect(() => {
    if (!editorChromeEnabled) {
      return undefined
    }

    function handleOutsideCanvasPointerDown(event) {
      const target = event.target

      if (!(target instanceof Node) || !(target instanceof HTMLElement)) {
        return
      }

      if (editingTextLayerId) {
        if (
          canvasRef.current?.contains(target) ||
          isTextEditingPreservingUiTarget(target)
        ) {
          return
        }

        commitTextEditing(editingTextLayerId)
        return
      }

      if (canvasRef.current?.contains(target)) {
        return
      }

      if (isSelectionPreservingUiTarget(target)) {
        return
      }

      if (interactionRef.current || selectedLayerIds.length === 0) {
        return
      }

      commit((currentDocument) => ({
        ...currentDocument,
        selectedLayerId: null,
        selectedLayerIds: [],
      }))
    }

    window.addEventListener('pointerdown', handleOutsideCanvasPointerDown)

    return () => {
      window.removeEventListener('pointerdown', handleOutsideCanvasPointerDown)
    }
  }, [commit, editingTextLayerId, editorChromeEnabled, selectedLayerIds.length])

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

    if (rectSelection?.rect) {
      renderRectSelection(context, rectSelection.rect)
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
  }, [
    activeMoveGuides,
    documentHeight,
    documentState,
    documentWidth,
    floatingSelection,
    gradientPreview,
    lassoSelection,
    rectSelection,
  ])

  useEffect(() => {
    if (!editorChromeEnabled) {
      return undefined
    }

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
        const deltaX = snapResult.x - interaction.startCenterX
        const deltaY = snapResult.y - interaction.startCenterY

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

        const nextX = nextCenter.x
        const nextY = nextCenter.y
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
          const resizeBaseLayer = interaction.startLayerSnapshot
          let nextDocument = updateLayer(currentDocument, interaction.layerId, (layer) => {
            const baseLayer = resizeBaseLayer?.id === layer.id ? resizeBaseLayer : layer

            if (interaction.layerType === 'text') {
              if (baseLayer.mode === 'box') {
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
                    ...baseLayer,
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
                Math.abs(interaction.startScaleX) * (nextWidth / Math.max(interaction.startWidth, 1)),
              )
              const nextScaleY = Math.max(
                0.1,
                Math.abs(interaction.startScaleY) * (nextHeight / Math.max(interaction.startHeight, 1)),
              )

              nextPrimaryLayer = {
                ...resizePointTextTransform(
                  {
                    ...baseLayer,
                    x: nextX,
                    y: nextY,
                  },
                  Math.sign(interaction.startScaleX || 1) * nextScaleX,
                  Math.sign(interaction.startScaleY || 1) * nextScaleY,
                ),
                width: baseLayer.measuredWidth ?? baseLayer.width,
                height: baseLayer.measuredHeight ?? baseLayer.height,
              }

              linkedRatioX = nextScaleX / Math.max(Math.abs(interaction.startScaleX), 0.0001)
              linkedRatioY = nextScaleY / Math.max(Math.abs(interaction.startScaleY), 0.0001)

              return nextPrimaryLayer
            }

            nextPrimaryLayer = {
              ...baseLayer,
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

            const originalTopLeft = centerToTopLeft(
              originalState.x,
              originalState.y,
              originalState.width,
              originalState.height,
            )
            const relativeX = (originalTopLeft.x - startBounds.x) / Math.max(startBounds.width, 1)
            const relativeY = (originalTopLeft.y - startBounds.y) / Math.max(startBounds.height, 1)
            const scaledX = nextX + (relativeX * nextWidth)
            const scaledY = nextY + (relativeY * nextHeight)
            const baseLayer = originalState.layerSnapshot ?? layer

            if (baseLayer.type === 'text') {
              if (baseLayer.mode === 'box') {
                const resizedWidth = clampValue(
                  originalState.width * ratioX,
                  MIN_LAYER_WIDTH,
                  MAX_LAYER_SIZE,
                )
                const resizedHeight = clampValue(
                  originalState.height * ratioY,
                  MIN_LAYER_HEIGHT,
                  MAX_LAYER_SIZE,
                )
                const resizedLayer = resizeBoxText(
                  {
                    ...baseLayer,
                    ...topLeftToCenter(scaledX, scaledY, resizedWidth, resizedHeight),
                  },
                  resizedWidth,
                  resizedHeight,
                )

                return resizedLayer
              }

              const maximumScaleX = MAX_LAYER_SIZE / Math.max(originalState.width, 1)
              const maximumScaleY = MAX_LAYER_SIZE / Math.max(originalState.height, 1)

              return {
                ...resizePointTextTransform(
                  {
                    ...baseLayer,
                    ...topLeftToCenter(
                      scaledX,
                      scaledY,
                      originalState.width,
                      originalState.height,
                    ),
                  },
                  scaleSignedLayerAxis(originalState.scaleX, ratioX, maximumScaleX),
                  scaleSignedLayerAxis(originalState.scaleY, ratioY, maximumScaleY),
                ),
                width: baseLayer.measuredWidth ?? baseLayer.width,
                height: baseLayer.measuredHeight ?? baseLayer.height,
              }
            }

            const resizedWidth = clampValue(
              originalState.width * ratioX,
              MIN_LAYER_WIDTH,
              MAX_LAYER_SIZE,
            )
            const resizedHeight = clampValue(
              originalState.height * ratioY,
              MIN_LAYER_HEIGHT,
              MAX_LAYER_SIZE,
            )

            return {
              ...baseLayer,
              ...topLeftToCenter(scaledX, scaledY, resizedWidth, resizedHeight),
              width: resizedWidth,
              height: resizedHeight,
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
        const nextRestoreCanvas = interaction.restoreCanvas
        const selectionRect = interaction.selectionRect

        for (const pointerSample of pointerSamples) {
          const layerPoint = toLayerSurfacePoint(
            pointerSample,
            currentLayer,
            nextRestoreCanvas,
          )

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

        const workingCanvas = cloneCanvas(nextRestoreCanvas)

        if (hasDragged) {
          if (currentLayer.type === 'text') {
            const strokeCanvas = createTransparentCanvas(workingCanvas.width, workingCanvas.height)
            const strokeContext = strokeCanvas.getContext('2d')

            if (!strokeContext) {
              return
            }

            withRectClip(strokeContext, selectionRect, () => {
              drawSmoothStroke(
                strokeContext,
                renderPoints,
                interaction.color,
                interaction.size,
              )
            })

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

            withRectClip(strokeContext, selectionRect, () => {
              drawSmoothStroke(
                strokeContext,
                renderPoints,
                interaction.color,
                interaction.size,
              )
            })

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
          withRectClip(maskContext, interaction.selectionRect, () => {
            paintMaskStroke(
              maskContext,
              interaction.lastPoint.x,
              interaction.lastPoint.y,
              layerPoint.x,
              layerPoint.y,
              interaction.size,
            )
          })

          const baseCanvas = renderTextLayerToCanvas(currentLayer)
          surfaceEntry.offscreenCanvas = applyEraseMask(baseCanvas, surfaceEntry.maskCanvas)
        } else {
          withRectClip(context, interaction.selectionRect, () => {
            eraseStroke(
              context,
              interaction.lastPoint.x,
              interaction.lastPoint.y,
              layerPoint.x,
              layerPoint.y,
              interaction.size,
            )
          })
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

      if (interaction.type === 'rect-select') {
        const nextEndPoint = event.shiftKey
          ? constrainRectSelectionToSquare(interaction.startPoint, documentPoint)
          : documentPoint
        const nextRect = createRectFromPoints(interaction.startPoint, nextEndPoint)

        if (!nextRect) {
          return
        }

        interactionRef.current = {
          ...interaction,
          rect: nextRect,
          hasChanged: nextRect.width >= 1 || nextRect.height >= 1,
        }
        setRectSelection({
          rect: nextRect,
          sourceLayerId: interaction.layerId,
          isDragging: true,
          isFloating: false,
          floatingCanvas: null,
          offsetX: 0,
          offsetY: 0,
        })
      }

      if (interaction.type === 'gradient') {
        const interactionLayer = interaction.workingLayer
          ?? findLayer(liveDocumentState, interaction.sourceLayerId)
        const layerPoint = interactionLayer && interaction.restoreCanvas
          ? documentPointToLayerSurfacePoint(
            interactionLayer,
            interaction.restoreCanvas,
            documentPoint,
            false,
          )
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

                withRectClip(strokeContext, interaction.selectionRect, () => {
                  drawDot(
                    strokeContext,
                    tapPoint.x,
                    tapPoint.y,
                    interaction.color,
                    interaction.size,
                  )
                })

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
                  withRectClip(strokeContext, interaction.selectionRect, () => {
                    drawDot(
                      strokeContext,
                      tapPoint.x,
                      tapPoint.y,
                      interaction.color,
                      interaction.size,
                    )
                  })
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

      if (interaction?.type === 'rect-select') {
        const nextRect = interaction.hasChanged ? interaction.rect : null
        const isMeaningfulRect = nextRect && nextRect.width >= 4 && nextRect.height >= 4

        setRectSelection(isMeaningfulRect ? {
          rect: nextRect,
          sourceLayerId: interaction.layerId,
          isDragging: false,
          isFloating: false,
          floatingCanvas: null,
          offsetX: 0,
          offsetY: 0,
        } : null)
        setActiveSvgToolLayerId(null)
        interactionRef.current = null
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
          const alphaLocked = isAlphaLocked(sourceLayer)
          let workingCanvas = cloneCanvas(interaction.restoreCanvas)
          let workingLayer = interaction.workingLayer ?? sourceLayer
          let gradientStartPoint = interaction.startPoint
          let gradientEndPoint = interaction.endPoint
          const selectionRect = interaction.selectionRect
          const coverageBounds = alphaLocked
            ? null
            : interaction.selectionRect
              ? interaction.selectionRect
            : createSurfaceCoverageBoundsFromPoints(interaction.startPoint, interaction.endPoint)
          const expansion = coverageBounds
            ? expandBitmapSurfaceToFitBounds(sourceLayer, workingCanvas, coverageBounds)
            : null

          if (expansion) {
            workingCanvas = expansion.canvas
            workingLayer = expansion.layer
            gradientStartPoint = {
              x: interaction.startPoint.x + expansion.contentOffsetX,
              y: interaction.startPoint.y + expansion.contentOffsetY,
            }
            gradientEndPoint = {
              x: interaction.endPoint.x + expansion.contentOffsetX,
              y: interaction.endPoint.y + expansion.contentOffsetY,
            }
          }
          const restoreCanvas = cloneCanvas(workingCanvas)

          const gradientStartColor = interaction.mode === 'fg-to-transparent'
            ? globalColors.foreground
            : globalColors.background
          const gradientEndColor = interaction.mode === 'fg-to-transparent'
            ? createTransparentColorFromHex(globalColors.foreground)
            : globalColors.foreground
          const gradientResult = gradientEndColor
            ? applyLinearGradientToCanvas(
              workingCanvas,
              gradientStartPoint,
              gradientEndPoint,
              gradientStartColor,
              gradientEndColor,
              {
                restrictToVisiblePixels: alphaLocked,
                preserveAlphaMask: alphaLocked,
              },
            )
            : { changed: false }

          if (gradientResult.changed) {
            if (selectionRect) {
              workingCanvas = applyRectSelectionToCanvas(
                workingCanvas,
                restoreCanvas,
                selectionRect,
              )
            }

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
                createBitmapEditableLayerPatch(nextLayer, nextBitmap, {
                  x: workingLayer.x,
                  y: workingLayer.y,
                  width: workingLayer.width,
                  height: workingLayer.height,
                }),
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
    editorChromeEnabled,
    globalColors,
    isSnapEnabled,
    setTransient,
    viewport,
  ])

  useEffect(() => {
    if (!editorChromeEnabled) {
      return undefined
    }

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

        if (rectSelection) {
          deleteSelectedRectRegion()
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
    deleteSelectedRectRegion,
    deleteFloatingSelection,
    documentState,
    editorChromeEnabled,
    floatingSelection,
    lassoSelection,
    rectSelection,
    selectedLayerIds,
    redo,
    undo,
    resetColors,
    swapColors,
    deleteSelectedLayers,
  ])

  function applyLayerDocumentUpdate(currentDocument, layerId, updater) {
    const sourceLayer = findLayer(currentDocument, layerId)

    if (!sourceLayer) {
      return currentDocument
    }

    const nextDocument = updateLayer(currentDocument, layerId, updater)
    const nextLayer = findLayer(nextDocument, layerId)

    if (nextLayer?.type === 'text' && !nextLayer.isTextShadow) {
      return syncShadowLayerForTextSource(nextDocument, layerId)
    }

    return nextDocument
  }

  function applyCoalescedLayerAdjustment({
    layerId,
    propertyKey,
    controlSource = 'inspector-input',
    startValue,
    nextValue,
    updater,
    useInactivityTimeout = true,
  }) {
    if (!layerId) {
      return
    }

    applyCoalescedUpdate({
      key: `layer:${layerId}:property:${propertyKey}:source:${controlSource}`,
      previousState: documentStateRef.current,
      startValue,
      nextValue,
      applyUpdate: () => {
        setTransient((currentDocument) => applyLayerDocumentUpdate(currentDocument, layerId, updater))
      },
      useInactivityTimeout,
    })
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
      autoFit: sourceLayer.autoFit,
      autoFitSourceFontSize: sourceLayer.autoFitSourceFontSize,
      autoFitSourceStyleRanges: sourceLayer.autoFitSourceStyleRanges,
      styleRanges: sourceLayer.styleRanges,
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
    finishCoalescedInspectorAdjustment()
    setTransient((currentDocument) => {
      const nextLayerId = layerId ?? getFallbackSelectedLayerId(currentDocument, currentDocument.selectedLayerId)
      return selectSingleLayer(currentDocument, nextLayerId)
    })
  }, [finishCoalescedInspectorAdjustment, setTransient])

  const toggleDocumentLayerSelection = useCallback((layerId) => {
    finishCoalescedInspectorAdjustment()
    setTransient((currentDocument) => toggleLayerInSelection(currentDocument, layerId))
  }, [finishCoalescedInspectorAdjustment, setTransient])

  const clearDocumentSelectionExplicitly = useCallback(() => {
    finishCoalescedInspectorAdjustment()
    setTransient((currentDocument) => clearSelection(currentDocument))
  }, [finishCoalescedInspectorAdjustment, setTransient])

  function addLayer(factory) {
    const nextLayer = factory()
    applyDocumentChange((currentDocument) => appendLayer(currentDocument, nextLayer))

    if (nextLayer.type === 'text') {
      setActiveTool('select')
    }
  }

  function updateAddLayerTextField(field, value) {
    setAddLayerTextFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
  }

  function updateAddLayerImageField(field, value) {
    setAddLayerImageFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
  }

  function applyAddLayerJsonToForms(parsedJson) {
    setAddLayerTextFormValues(parsedJson.textFormValues)
    setAddLayerImageFormValues(parsedJson.imageFormValues)
    setAddLayerTextCreationSource(parsedJson.textSpecs.length > 0 ? 'json' : 'manual')

    if (parsedJson.textSpecs.length > 0 && parsedJson.imageSpecs.length === 0) {
      setAddLayerPanelType('text')
      return
    }

    if (parsedJson.imageSpecs.length > 0 && parsedJson.textSpecs.length === 0) {
      setAddLayerPanelType('image')
      return
    }

    if (addLayerPanelType === 'text' && parsedJson.textSpecs.length === 0 && parsedJson.imageSpecs.length > 0) {
      setAddLayerPanelType('image')
      return
    }

    if (addLayerPanelType === 'image' && parsedJson.imageSpecs.length === 0 && parsedJson.textSpecs.length > 0) {
      setAddLayerPanelType('text')
    }
  }

  function handleApplyAddLayerJson() {
    const parsedJson = parseAddLayerJson(addLayerJsonInput)

    if (parsedJson.error) {
      showAddLayerPanelStatus(parsedJson.error, 'error')
      return
    }

    applyAddLayerJsonToForms(parsedJson)

    const createdLayerCount = parsedJson.textSpecs.length + parsedJson.imageSpecs.length
    showAddLayerPanelStatus(
      createdLayerCount === 1
        ? 'JSON parsed. One layer spec is ready.'
        : `JSON parsed. ${createdLayerCount} layer specs are ready.`,
    )
  }

  function clampLayerInsertionIndex(index, layerCount) {
    if (!Number.isFinite(index)) {
      return layerCount
    }

    return Math.max(0, Math.min(Math.trunc(index), layerCount))
  }

  function insertLayerAtPlacement(layers, layer, layerPlacement) {
    const nextLayers = [...layers]
    const insertionIndex = clampLayerInsertionIndex(
      layerPlacement === undefined ? nextLayers.length : layerPlacement,
      nextLayers.length,
    )

    nextLayers.splice(insertionIndex, 0, layer)
    return nextLayers
  }

  function applyPreparedLayerCreations(currentDocument, preparedEntries) {
    if (preparedEntries.length === 0) {
      return currentDocument
    }

    let nextDocument = currentDocument
    const primaryLayerIds = []

    for (const entry of preparedEntries) {
      nextDocument = {
        ...nextDocument,
        layers: insertLayerAtPlacement(
          nextDocument.layers,
          entry.layer,
          entry.layerPlacement,
        ),
      }
      primaryLayerIds.push(entry.layer.id)

      if (!entry.addShadow || entry.layer.type !== 'text' || entry.layer.isTextShadow) {
        continue
      }

      const sourceLayer = findLayer(nextDocument, entry.layer.id)

      if (!sourceLayer || sourceLayer.type !== 'text' || sourceLayer.isTextShadow) {
        continue
      }

      const shadowLayer = createTextShadowLayer(sourceLayer, {
        offsetX: DEFAULT_TEXT_SHADOW_OFFSET_X,
        offsetY: DEFAULT_TEXT_SHADOW_OFFSET_Y,
        opacity: DEFAULT_TEXT_SHADOW_OPACITY,
      })
      const sourceIndex = nextDocument.layers.findIndex((layer) => layer.id === sourceLayer.id)

      if (sourceIndex === -1) {
        continue
      }

      const nextLayers = [...nextDocument.layers]
      nextLayers.splice(sourceIndex, 0, shadowLayer)
      nextDocument = {
        ...nextDocument,
        layers: nextLayers.map((layer) => (
          layer.id === sourceLayer.id
            ? {
              ...layer,
              shadowLayerId: shadowLayer.id,
            }
            : layer
        )),
      }
      nextDocument = linkLayerPair(nextDocument, sourceLayer.id, shadowLayer.id)
    }

    return {
      ...nextDocument,
      selectedLayerId: primaryLayerIds.at(-1) ?? null,
      selectedLayerIds: primaryLayerIds,
    }
  }

  async function prepareAddPanelLayerEntries(entries) {
    const preparedEntries = []
    const errors = []

    for (const entry of entries) {
      if (entry.type === 'text') {
        preparedEntries.push({
          layer: entry.source === 'json'
            ? createExactTextLayerFromJsonSpec(entry.spec)
            : createTextLayerFromAddSpec(entry.spec),
          layerPlacement: entry.spec.layerPlacement,
          addShadow: Boolean(entry.spec.addShadow),
        })
        continue
      }

      try {
        const layer = await createImageLayerFromAddSpec(entry.spec, {
          loadImageDimensions: async (src) => {
            const dimensions = await loadImageDimensionsFromSource(src)
            return {
              width: dimensions.width,
              height: dimensions.height,
            }
          },
          documentWidth,
          documentHeight,
        })
        preparedEntries.push({
          layer,
          layerPlacement: entry.spec.layerPlacement,
          addShadow: false,
        })
      } catch {
        errors.push(`Image source could not be loaded: ${entry.spec.src}`)
      }
    }

    return {
      preparedEntries,
      errors,
    }
  }

  async function createLayersFromAddPanelEntries(entries, successMessage) {
    const { preparedEntries, errors } = await prepareAddPanelLayerEntries(entries)

    if (preparedEntries.length === 0) {
      showAddLayerPanelStatus(errors[0] ?? 'No valid layer specs were provided.', 'error')
      return
    }

    commit((currentDocument) => applyPreparedLayerCreations(currentDocument, preparedEntries))
    setActiveTool('select')

    if (errors.length > 0) {
      showAddLayerPanelStatus(
        `${successMessage} ${errors[0]}`,
        'error',
      )
      return
    }

    showAddLayerPanelStatus(successMessage)
  }

  async function handleCreateAddLayer() {
    if (addLayerPanelType === 'text') {
      const textSpec = normalizeTextLayerSpecFromForm(addLayerTextFormValues)

      await createLayersFromAddPanelEntries(
        [{
          type: 'text',
          spec: textSpec,
          ...(addLayerTextCreationSource === 'json' ? { source: 'json' } : {}),
        }],
        'Text layer created.',
      )
      return
    }

    const imageSpec = normalizeImageLayerSpecFromForm(addLayerImageFormValues)

    if (!imageSpec) {
      showAddLayerPanelStatus('A valid image source is required to create an image layer.', 'error')
      return
    }

    await createLayersFromAddPanelEntries(
      [{ type: 'image', spec: imageSpec }],
      'Image layer created.',
    )
  }

  async function handleCreateLayersFromJson() {
    const parsedJson = parseAddLayerJson(addLayerJsonInput)

    if (parsedJson.error) {
      showAddLayerPanelStatus(parsedJson.error, 'error')
      return
    }

    applyAddLayerJsonToForms(parsedJson)

    const entries = [
      ...parsedJson.textSpecs.map((spec) => ({ type: 'text', spec })),
      ...parsedJson.imageSpecs.map((spec) => ({ type: 'image', spec })),
    ]

    await createLayersFromAddPanelEntries(
      entries.map((entry) => ({ ...entry, source: 'json' })),
      entries.length === 1 ? 'One layer created from JSON.' : `${entries.length} layers created from JSON.`,
    )
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
    clearAddLayerPanelStatusTimer()
    clearToolPanelErrorTimers()
    interactionRef.current = null
    rasterSurfacesRef.current = new Map()
    copiedLayerRef.current = null
    lastPenEditableLayerIdRef.current = null
    externalImageDragDepthRef.current = 0
    setEditingTextLayerId(null)
    setTextDraft('')
    setTextEditorSelection({ start: 0, end: 0 })
    setFontSizeDraftValue(null)
    setToolPanelError({
      message: '',
      isRendered: false,
      isVisible: false,
      isFading: false,
    })
    setActiveTool('select')
    setLassoSelection(null)
    setRectSelection(null)
    setFloatingSelection(null)
    setDraggedLayerId(null)
    setLayerDropTarget(null)
    setAssetLibrary([])
    setAddLayerJsonInput('')
    setAddLayerPanelStatus({ message: '', tone: 'info' })
    setAddLayerPanelType('text')
    setAddLayerTextCreationSource('manual')
    setAddLayerTextFormValues(getDefaultTextLayerFormValues())
    setAddLayerImageFormValues(getDefaultImageLayerFormValues())
    setDraggedAssetId(null)
    setActiveSvgToolLayerId(null)
    setIsFileMenuOpen(false)
    setIsSettingsModalOpen(false)
    setIsCanvasAssetDropActive(false)
    setIsExternalImageDragActive(false)
    setIsOpeningFile(false)
    setIsExporting(false)
    setActiveMoveGuides(createEmptySnapGuides())
    setViewport({
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    })
  }, [clearAddLayerPanelStatusTimer, clearToolPanelErrorTimers])

  const loadDocumentState = useCallback((nextDocumentState) => {
    const normalizedDocument = normalizeDocumentState(nextDocumentState)

    resetEditorRuntimeState()
    setIsFirstEntryCanvasVisible(false)
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

  const handleSelectNewFilePreset = useCallback((preset) => {
    if (!preset) {
      return
    }

    setNewFileWidthInput(String(preset.width))
    setNewFileHeightInput(String(preset.height))
  }, [])

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

  useEffect(() => {
    if (!editorChromeEnabled) {
      return undefined
    }

    function handleWindowDrop() {
      resetExternalImageDragState()
    }

    function handleWindowDragEnd() {
      resetExternalImageDragState()
    }

    window.addEventListener('drop', handleWindowDrop)
    window.addEventListener('dragend', handleWindowDragEnd)

    return () => {
      window.removeEventListener('drop', handleWindowDrop)
      window.removeEventListener('dragend', handleWindowDragEnd)
    }
  }, [editorChromeEnabled, resetExternalImageDragState])

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

  async function createImportedImageLayerFromSource({
    name,
    src,
    sourceKind,
    formatHint = '',
    width = null,
    height = null,
    topLeftX = null,
    topLeftY = null,
    centerX = null,
    centerY = null,
  }) {
    const normalizedSource = typeof src === 'string' ? src.trim() : ''

    if (!normalizedSource) {
      throw new Error('Image source could not be loaded.')
    }

    let dimensions = getImportedImageDimensions(width, height)

    if (!dimensions) {
      const loadedDimensions = await loadImageDimensionsFromSource(normalizedSource)
      dimensions = getImportedImageDimensions(loadedDimensions.width, loadedDimensions.height)
    }

    if (!dimensions) {
      throw new Error('Image source could not be loaded.')
    }

    let finalSource = normalizedSource
    let finalDimensions = dimensions

    if (shouldTrimTransparentImport({
      enabled: trimTransparentImports,
      sourceKind,
      formatHint,
      src: normalizedSource,
    })) {
      const trimmedSource = await trimImageSourceTransparentBounds(normalizedSource, {
        alphaThreshold: DEFAULT_IMPORT_TRIM_ALPHA_THRESHOLD,
        padding: DEFAULT_IMPORT_TRIM_PADDING,
      })
      const trimmedDimensions = getImportedImageDimensions(trimmedSource.width, trimmedSource.height)

      if (trimmedSource.didTrim && trimmedDimensions) {
        finalSource = trimmedSource.src
        finalDimensions = trimmedDimensions
      }
    }

    const resolvedTopLeftX = Number.isFinite(Number(centerX))
      ? Number(centerX) - (finalDimensions.width / 2)
      : topLeftX
    const resolvedTopLeftY = Number.isFinite(Number(centerY))
      ? Number(centerY) - (finalDimensions.height / 2)
      : topLeftY

    return createValidatedImportedImageLayer({
      name,
      src: finalSource,
      width: finalDimensions.width,
      height: finalDimensions.height,
      documentWidth,
      documentHeight,
      topLeftX: resolvedTopLeftX,
      topLeftY: resolvedTopLeftY,
      sourceKind,
    })
  }

  async function importImageFile(file) {
    const imageDataUrl = await readFileAsDataUrl(file)
    const nextLayer = await createImportedImageLayerFromSource({
      name: file.name.replace(/\.[^.]+$/, '') || 'Imported Image',
      src: imageDataUrl,
      sourceKind: getImportedSourceKind(file, imageDataUrl),
      formatHint: getAssetKind(file),
    })

    addLayer(() => nextLayer)
    setActiveTool('select')
  }

  function handleImageImportFailure(error, fallbackMessage = 'Image source could not be loaded.') {
    showToolPanelError(
      error instanceof Error
        ? error.message
        : typeof error === 'string' && error.trim().length > 0
          ? error
          : fallbackMessage,
    )
  }

  async function handleImageImport(event) {
    const file = getSupportedImageFiles(event.target.files)[0]

    if (!file) {
      event.target.value = ''
      return
    }

    const resetInput = () => {
      event.target.value = ''
    }

    try {
      await importImageFile(file)
    } catch (error) {
      handleImageImportFailure(error)
    }

    resetInput()
  }

  async function handleAssetLibraryImport(event) {
    const files = event.target.files

    if (!files?.length) {
      return
    }

    try {
      const { assets, errors } = await importAssetsFromFiles(files)
      let assetLimitMessage = null

      if (assets.length > 0) {
        const availableSlots = Math.max(MAX_ASSET_LIBRARY_ITEMS - assetLibrary.length, 0)
        const acceptedAssets = assets.slice(0, availableSlots)
        const rejectedAssetCount = assets.length - acceptedAssets.length

        if (acceptedAssets.length > 0) {
          setAssetLibrary((currentAssets) => [...currentAssets, ...acceptedAssets])
        }

        if (rejectedAssetCount > 0 || availableSlots === 0) {
          assetLimitMessage = getAssetLibraryLimitMessage(
            acceptedAssets.length,
            rejectedAssetCount || assets.length,
          )
        }
      }

      if (errors.length > 0) {
        handleImageImportFailure(errors[0])
      } else if (assetLimitMessage) {
        showToolPanelError(assetLimitMessage)
      }
    } finally {
      event.target.value = ''
    }
  }

  async function createImageLayerFromAsset(asset, x, y) {
    const dimensions = getImportedImageDimensions(asset.width, asset.height)

    return createImportedImageLayerFromSource({
      name: asset.name,
      src: asset.src,
      formatHint: asset.kind,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      centerX: x,
      centerY: y,
      sourceKind: asset.sourceKind ?? inferImageSourceKindFromSrc(asset.src),
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

  function handleExternalImageDragEnter(event) {
    if (!hasSupportedExternalImageDrag(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    externalImageDragDepthRef.current += 1

    if (!isExternalImageDragActive) {
      setIsExternalImageDragActive(true)
    }
  }

  function handleExternalImageDragOver(event) {
    if (!hasSupportedExternalImageDrag(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'

    if (!isExternalImageDragActive) {
      setIsExternalImageDragActive(true)
    }
  }

  function handleExternalImageDragLeave(event) {
    if (!isExternalImageDragActive || isInternalAssetDrag(event.dataTransfer)) {
      return
    }

    if (appShellRef.current?.contains(event.relatedTarget)) {
      return
    }

    externalImageDragDepthRef.current = Math.max(0, externalImageDragDepthRef.current - 1)

    if (externalImageDragDepthRef.current === 0) {
      setIsExternalImageDragActive(false)
    }
  }

  async function handleExternalImageDrop(event) {
    if (!hasSupportedExternalImageDrag(event.dataTransfer)) {
      return false
    }

    const file = getSupportedImageFiles(event.dataTransfer.files)[0]

    event.preventDefault()
    event.stopPropagation()
    resetExternalImageDragState()

    if (!file) {
      return true
    }

    try {
      await importImageFile(file)
    } catch (error) {
      handleImageImportFailure(error)
    }

    return true
  }

  function handleCanvasDragOver(event) {
    if (event.dataTransfer.types.includes(ASSET_DRAG_MIME_TYPE)) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'

      if (!isCanvasAssetDropActive) {
        setIsCanvasAssetDropActive(true)
      }

      return
    }

    if (hasSupportedExternalImageDrag(event.dataTransfer)) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  async function handleCanvasAssetDrop(event) {
    const assetId = event.dataTransfer.getData(ASSET_DRAG_MIME_TYPE)

    if (!assetId) {
      await handleExternalImageDrop(event)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setIsCanvasAssetDropActive(false)
    setDraggedAssetId(null)

    const asset = assetLibrary.find((candidate) => candidate.id === assetId)
    const dropPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)

    if (!asset || !dropPoint) {
      return
    }

    try {
      const nextLayer = await createImageLayerFromAsset(asset, dropPoint.x, dropPoint.y)
      applyDocumentChange((currentDocument) => appendLayer(currentDocument, nextLayer))
    } catch (error) {
      handleImageImportFailure(error)
    }
  }

  function updateSelectedLayer(patch) {
    if (!selectedLayer || selectedLayerIds.length !== 1) {
      return
    }

    applyDocumentChange((currentDocument) => applyLayerDocumentUpdate(currentDocument, selectedLayer.id, patch))
  }

  function applyTextLayerUpdate(layerId, updater, applyTransient = false) {
    const runner = applyTransient ? setTransient : applyDocumentChange

    runner((currentDocument) => {
      const sourceLayer = findLayer(currentDocument, layerId)

      if (sourceLayer?.type !== 'text') {
        return currentDocument
      }

      return applyLayerDocumentUpdate(currentDocument, layerId, (layer) => (
        layer.type === 'text' ? updater(layer) : layer
      ))
    })
  }

  function getEditingTextSelectionRange(layerId) {
    if (editingTextLayerId !== layerId) {
      return null
    }

    const selection = textSelectionRestoreRef.current ?? textSelectionRef.current
    const start = Math.max(0, Math.floor(Number(selection?.start) || 0))
    const end = Math.max(0, Math.floor(Number(selection?.end) || 0))

    if (end <= start) {
      return null
    }

    return { start, end }
  }

  function markTextStyleControlInteraction() {
    if (!editingTextLayerId) {
      return
    }

    preserveTextEditingBlurRef.current = true
    textSelectionRestoreRef.current = {
      ...textSelectionRef.current,
    }
  }

  function applyTextStyleChange(layerId, stylesOrUpdater) {
    const selection = getEditingTextSelectionRange(layerId)

    if (selection) {
      applyTextLayerUpdate(
        layerId,
        (layer) => (
          typeof stylesOrUpdater === 'function'
            ? stylesOrUpdater(layer)
            : applyTextStyleToRange(layer, selection.start, selection.end, stylesOrUpdater)
        ),
      )
      restoreTextEditorSelection(selection)
      return
    }

    applyTextLayerUpdate(
      layerId,
      (layer) => (
        typeof stylesOrUpdater === 'function'
          ? stylesOrUpdater(layer)
          : updateTextStyle(layer, stylesOrUpdater)
      ),
    )

    if (editingTextLayerId === layerId) {
      restoreTextEditorSelection()
    }
  }

  function isEditingSelectionFullyBold(layer) {
    if (!layer || layer.type !== 'text') {
      return false
    }

    const selection = getEditingTextSelectionRange(layer.id)

    if (!selection) {
      return Number(layer.fontWeight) >= 700
    }

    return isTextRangeFullyBold(layer, selection.start, selection.end)
  }

  function getEditingSelectionStyleValue(layer, key) {
    if (!layer || layer.type !== 'text') {
      return null
    }

    const selection = getEditingTextSelectionRange(layer.id)

    if (!selection) {
      if (key === 'strokeColor') {
        return layer.textStrokeColor ?? layer.strokeColor ?? ''
      }

      if (key === 'strokeWidth') {
        return layer.textStrokeWidth ?? layer.strokeWidth ?? 0
      }

      return layer[key]
    }

    return getUniformTextStyleValueForRange(layer, selection.start, selection.end, key)
  }

  function getDisplayedFontSizeValue(layer) {
    if (fontSizeInputDraft !== null) {
      return fontSizeInputDraft
    }

    return getEditingSelectionStyleValue(layer, 'fontSize') ?? ''
  }

  function commitFontSizeInputDraft(layerId) {
    const pendingDraft = fontSizeInputDraftRef.current

    if (pendingDraft === null) {
      return
    }

    const trimmedDraft = String(pendingDraft).trim()

    if (trimmedDraft.length === 0) {
      setFontSizeDraftValue(null)
      return
    }

    const nextValue = Number(trimmedDraft)

    if (Number.isFinite(nextValue)) {
      applyTextStyleChange(layerId, {
        fontSize: clampFontSizeInputValue(nextValue),
      })
    }

    setFontSizeDraftValue(null)
  }

  function flushPendingFontSizeInputDraft(target) {
    const activeFontSizeInput = fontSizeInputRef.current

    if (
      fontSizeInputDraftRef.current === null ||
      !activeFontSizeInput ||
      target === activeFontSizeInput
    ) {
      return
    }

    if (selectedLayer?.type === 'text') {
      commitFontSizeInputDraft(selectedLayer.id)
    }
  }

  function stepTextFontSize(layerId, delta) {
    const layer = findLayer(documentStateRef.current, layerId)

    if (!layer || layer.type !== 'text') {
      return
    }

    setFontSizeDraftValue(null)
    const selection = getEditingTextSelectionRange(layerId)
    const currentFontSize = selection
      ? (getUniformTextStyleValueForRange(layer, selection.start, selection.end, 'fontSize') ?? layer.fontSize)
      : layer.fontSize
    const nextFontSize = clampFontSizeInputValue(Number(currentFontSize) + delta)
    const sessionScope = selection ? `${selection.start}-${selection.end}` : 'layer'

    applyCoalescedLayerAdjustment({
      layerId,
      propertyKey: `fontSize:${sessionScope}`,
      controlSource: 'font-size-stepper',
      startValue: Number(currentFontSize),
      nextValue: nextFontSize,
      useInactivityTimeout: false,
      updater: (currentLayer) => {
        if (currentLayer.type !== 'text') {
          return currentLayer
        }

        if (selection) {
          return applyTextStyleToRange(currentLayer, selection.start, selection.end, {
            fontSize: nextFontSize,
          })
        }

        return updateTextStyle(currentLayer, {
          fontSize: nextFontSize,
        })
      },
    })
  }

  function handleTextFontSizeStep(layerId, delta) {
    stepTextFontSize(layerId, delta)
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

  function getActiveRectSelectionLayer() {
    const selectedDocumentLayer = getSingleSelectedLayer(documentState)

    if (!selectedDocumentLayer || !canLassoLayer(selectedDocumentLayer)) {
      return null
    }

    return selectedDocumentLayer
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
    const layerTopLeft = getLayerTopLeft(layer)

    return {
      sourceLayerId: layer.id,
      canvas: extractedCanvas,
      x: layerTopLeft.x + (sourceSelection.bounds.minX * scaleX),
      y: layerTopLeft.y + (sourceSelection.bounds.minY * scaleY),
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

  function createSourceRectSelectionFromDocumentRect(layer, sourceCanvas, rect) {
    if (!layer || !sourceCanvas || !rect) {
      return null
    }

    const sourcePoints = getRectSelectionPoints(rect)
      .map((point) => documentPointToLayerSurfacePoint(layer, sourceCanvas, point, false))
      .filter(Boolean)

    if (sourcePoints.length === 0) {
      return null
    }

    let minimumX = Number.POSITIVE_INFINITY
    let minimumY = Number.POSITIVE_INFINITY
    let maximumX = Number.NEGATIVE_INFINITY
    let maximumY = Number.NEGATIVE_INFINITY

    for (const point of sourcePoints) {
      minimumX = Math.min(minimumX, point.x)
      minimumY = Math.min(minimumY, point.y)
      maximumX = Math.max(maximumX, point.x)
      maximumY = Math.max(maximumY, point.y)
    }

    return createRectFromPoints(
      { x: minimumX, y: minimumY },
      { x: maximumX, y: maximumY },
    )
  }

  function prepareRectConstrainedSurface(layer, sourceCanvas, documentRect) {
    if (!layer || !sourceCanvas || !documentRect) {
      return {
        layer,
        canvas: sourceCanvas,
        selectionRect: null,
      }
    }

    const currentSelectionRect = createSourceRectSelectionFromDocumentRect(layer, sourceCanvas, documentRect)
    const expansion = currentSelectionRect
      ? expandBitmapSurfaceToFitBounds(layer, sourceCanvas, currentSelectionRect)
      : null
    const nextLayer = expansion?.layer ?? layer
    const nextCanvas = expansion?.canvas ?? sourceCanvas
    const nextSelectionRect = createSourceRectSelectionFromDocumentRect(
      nextLayer,
      nextCanvas,
      documentRect,
    )

    return {
      layer: nextLayer,
      canvas: nextCanvas,
      selectionRect: nextSelectionRect,
    }
  }

  function createRectSelectionFromFloating(
    nextFloatingSelection,
    sourceLayerId = nextFloatingSelection.sourceLayerId,
  ) {
    return {
      rect: {
        x: nextFloatingSelection.x,
        y: nextFloatingSelection.y,
        width: nextFloatingSelection.width,
        height: nextFloatingSelection.height,
      },
      sourceLayerId,
      isDragging: false,
      isFloating: false,
      floatingCanvas: null,
      offsetX: 0,
      offsetY: 0,
    }
  }

  function getLayerSurfacePixelHit(layer, localPoint) {
    const surfaceEntry = rasterSurfacesRef.current.get(layer.id)
    const surfaceCanvas = surfaceEntry?.offscreenCanvas ?? surfaceEntry?.visibleCanvas

    if (!surfaceCanvas) {
      return null
    }

    const normalizedX = localPoint.x / Math.max(layer.width, 1)
    const normalizedY = localPoint.y / Math.max(layer.height, 1)

    return hasVisibleCanvasPixelNearby(surfaceCanvas, {
      x: Math.min(
        surfaceCanvas.width - 1,
        Math.max(0, normalizedX * surfaceCanvas.width),
      ),
      y: Math.min(
        surfaceCanvas.height - 1,
        Math.max(0, normalizedY * surfaceCanvas.height),
      ),
    }, PIXEL_HIT_PADDING, VISIBLE_PIXEL_ALPHA_THRESHOLD)
  }

  function getLayerPixelHitResult(layer, localPoint) {
    const hasVisiblePixelNearby = getLayerSurfacePixelHit(layer, localPoint)

    if (hasVisiblePixelNearby === null) {
      if (layer?.type === 'text' || layer?.type === 'image') {
        return null
      }

      return false
    }

    return hasVisiblePixelNearby
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
      return getLayerPixelHitResult(layer, localPoint)
    }

    return true
  }

  function shouldPreferInconclusiveLayerHit(layer) {
    return layer?.type === 'text' || layer?.type === 'image'
  }

  function resolveTopLayerAtPoint(documentPoint, preferredLayer = null, options = {}) {
    const {
      requireDefinitePreferredHit = false,
      disallowInconclusiveLayerIds = [],
    } = options
    const disallowedInconclusiveLayerIds = new Set(disallowInconclusiveLayerIds)

    if (preferredLayer) {
      const preferredHitResult = isLayerHitAtDocumentPoint(preferredLayer, documentPoint)

      if (
        preferredHitResult === true ||
        (
          !requireDefinitePreferredHit &&
          preferredHitResult === null &&
          shouldPreferInconclusiveLayerHit(preferredLayer)
        )
      ) {
        return preferredLayer
      }
    }

    for (let index = documentState.layers.length - 1; index >= 0; index -= 1) {
      const layer = documentState.layers[index]
      if (preferredLayer && layer.id === preferredLayer.id) {
        continue
      }
      const hitResult = isLayerHitAtDocumentPoint(layer, documentPoint)

      if (
        hitResult === true ||
        (
          hitResult === null &&
          shouldPreferInconclusiveLayerHit(layer) &&
          !disallowedInconclusiveLayerIds.has(layer.id)
        )
      ) {
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

  function resolveSelectToolTarget(documentPoint, fallbackLayer = null) {
    if (!documentPoint) {
      return fallbackLayer
    }

    return resolveTopLayerAtPoint(documentPoint) ?? fallbackLayer
  }

  function handleSelectToolPointerDown(event, fallbackLayer = null) {
    if (isResizeHandleTarget(event.target)) {
      return
    }

    const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)
    const hitLayer = resolveSelectToolTarget(documentPoint, fallbackLayer)

    event.stopPropagation()
    event.preventDefault()

    if (event.shiftKey) {
      if (hitLayer) {
        toggleDocumentLayerSelection(hitLayer.id)
      }
      return
    }

    if (!hitLayer) {
      clearDocumentSelectionExplicitly()
      return
    }

    if (!isLayerSelected(documentState, hitLayer.id)) {
      selectDocumentLayer(hitLayer.id)
      return
    }

    if (hitLayer.type === 'text' && event.detail > 1) {
      return
    }

    startMove(event, hitLayer)
  }

  function doesSingleSelectionFrameCoverDocument(layer) {
    if (!layer) {
      return false
    }

    const bounds = getLayerTransformBounds(layer)

    return (
      bounds.minX <= 0 &&
      bounds.minY <= 0 &&
      bounds.maxX >= documentState.width &&
      bounds.maxY >= documentState.height
    )
  }

  function handleSingleSelectionFramePointerDown(event, layer) {
    if (isResizeHandleTarget(event.target)) {
      return
    }

    const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)
    const shouldYieldToTopLayer = (
      doesSingleSelectionFrameCoverDocument(layer) &&
      documentPoint
    )
    const topLayer = shouldYieldToTopLayer ? resolveTopLayerAtPoint(documentPoint) : null

    if (event.shiftKey) {
      if (topLayer && !isLayerSelected(documentState, topLayer.id)) {
        event.stopPropagation()
        event.preventDefault()
        toggleDocumentLayerSelection(topLayer.id)
      }
      return
    }

    if (topLayer && topLayer.id !== layer.id) {
      event.stopPropagation()
      event.preventDefault()
      selectDocumentLayer(topLayer.id)
      return
    }

    if (layer.type === 'text' && event.detail > 1) {
      event.stopPropagation()
      event.preventDefault()
      return
    }

    startMove(event, layer)
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
        offsetX: documentPoint.x - bounds.centerX,
        offsetY: documentPoint.y - bounds.centerY,
        frameWidth: bounds.width,
        frameHeight: bounds.height,
        startCenterX: bounds.centerX,
        startCenterY: bounds.centerY,
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
            layerSnapshot: selectedLayer,
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
      startLayerSnapshot: layer,
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
    const interactionLayer = penLayer
    const interactionSurface = await ensureRasterLayerSurface(penLayer)

    const startPoint = toLayerSurfacePoint(event, interactionLayer, interactionSurface)
    const activeRectSelection = rectSelection?.sourceLayerId === penLayer.id ? rectSelection : null
    const selectionRect = activeRectSelection?.rect
      ? createSourceRectSelectionFromDocumentRect(interactionLayer, interactionSurface, activeRectSelection.rect)
      : null

    if (!interactionSurface || !surfaceEntry || !startPoint) {
      return
    }

    if (selectionRect && !isPointInsideRect(startPoint, selectionRect)) {
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
      points: [startPoint],
      color: globalColors.foreground,
      size: penSize,
      minimumDistance: getStrokeMinimumDistance(penSize),
      dragThreshold: getStrokeDragThreshold(penSize),
      hasDragged: false,
      restoreCanvas,
      selectionRect,
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
    const activeRectSelection = rectSelection?.sourceLayerId === eraseLayer.id ? rectSelection : null
    const selectionRect = activeRectSelection?.rect
      ? createSourceRectSelectionFromDocumentRect(eraseLayer, surfaceCanvas, activeRectSelection.rect)
      : null

    if (!surfaceCanvas || !surfaceEntry || !layerPoint) {
      return
    }

    if (selectionRect && !isPointInsideRect(layerPoint, selectionRect)) {
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
      withRectClip(maskContext, selectionRect, () => {
        paintMaskDot(maskContext, layerPoint.x, layerPoint.y, eraserSize)
      })
      const baseCanvas = renderTextLayerToCanvas(eraseLayer)
      surfaceEntry.offscreenCanvas = applyEraseMask(baseCanvas, surfaceEntry.maskCanvas)
    } else {
      withRectClip(context, selectionRect, () => {
        eraseDot(context, layerPoint.x, layerPoint.y, eraserSize)
      })
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
      selectionRect,
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

    const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)
    const activeRectSelection = rectSelection?.sourceLayerId === fillLayer.id ? rectSelection : null
    const documentSelectionRect = activeRectSelection?.rect ?? null
    const surfaceCanvas = await ensureRasterLayerSurface(fillLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(fillLayer.id)

    if (!surfaceCanvas || !surfaceEntry || !documentPoint) {
      return
    }

    if (documentSelectionRect && !isPointInsideRect(documentPoint, documentSelectionRect)) {
      return
    }

    const alphaLocked = isAlphaLocked(fillLayer)
    const marqueeSurface = !alphaLocked && documentSelectionRect
      ? prepareRectConstrainedSurface(fillLayer, surfaceCanvas, documentSelectionRect)
      : {
        layer: fillLayer,
        canvas: surfaceCanvas,
        selectionRect: documentSelectionRect
          ? createSourceRectSelectionFromDocumentRect(fillLayer, surfaceCanvas, documentSelectionRect)
          : null,
      }
    let workingCanvas = cloneCanvas(marqueeSurface.canvas)
    let workingLayer = marqueeSurface.layer
    let shiftedSelectionRect = marqueeSurface.selectionRect
    let restoreCanvas = cloneCanvas(marqueeSurface.canvas)
    let shiftedLayerPoint = documentPointToLayerSurfacePoint(
      workingLayer,
      workingCanvas,
      documentPoint,
      false,
    )

    if (!shiftedLayerPoint) {
      return
    }

    const initialFillResult = floodFillCanvas(
      cloneCanvas(workingCanvas),
      shiftedLayerPoint.x,
      shiftedLayerPoint.y,
      globalColors.foreground,
      bucketTolerance,
      {
        preserveAlpha: alphaLocked,
        restrictToVisiblePixels: alphaLocked,
      },
    )

    if (!initialFillResult.changed) {
      return
    }

    if (!alphaLocked && !documentSelectionRect) {
      const expansionBounds = getBucketFillExpansionCoverageBounds(
        fillLayer,
        surfaceCanvas,
        initialFillResult.reachedBoundary,
        documentWidth,
        documentHeight,
      )
      const expansion = expansionBounds
        ? expandBitmapSurfaceToFitBounds(fillLayer, surfaceCanvas, expansionBounds)
        : null

      if (expansion) {
        workingCanvas = expansion.canvas
        workingLayer = expansion.layer
        shiftedLayerPoint = {
          x: shiftedLayerPoint.x + expansion.contentOffsetX,
          y: shiftedLayerPoint.y + expansion.contentOffsetY,
        }
        restoreCanvas = cloneCanvas(workingCanvas)
      }
    }

    const fillResult = floodFillCanvas(
      workingCanvas,
      shiftedLayerPoint.x,
      shiftedLayerPoint.y,
      globalColors.foreground,
      bucketTolerance,
      {
        preserveAlpha: alphaLocked,
        restrictToVisiblePixels: alphaLocked,
      },
    )

    if (!fillResult.changed) {
      return
    }

    if (shiftedSelectionRect) {
      workingCanvas = applyRectSelectionToCanvas(workingCanvas, restoreCanvas, shiftedSelectionRect)
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
        createBitmapEditableLayerPatch(currentLayer, nextBitmap, {
          x: workingLayer.x,
          y: workingLayer.y,
          width: workingLayer.width,
          height: workingLayer.height,
        }),
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

    const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)
    const activeRectSelection = rectSelection?.sourceLayerId === gradientLayer.id ? rectSelection : null
    const documentSelectionRect = activeRectSelection?.rect ?? null
    const surfaceCanvas = await ensureRasterLayerSurface(gradientLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(gradientLayer.id)

    if (!surfaceCanvas || !surfaceEntry || !documentPoint) {
      return
    }

    if (documentSelectionRect && !isPointInsideRect(documentPoint, documentSelectionRect)) {
      return
    }

    const constrainedSurface = documentSelectionRect
      ? prepareRectConstrainedSurface(gradientLayer, surfaceCanvas, documentSelectionRect)
      : {
        layer: gradientLayer,
        canvas: surfaceCanvas,
        selectionRect: null,
      }
    const startPoint = documentPointToLayerSurfacePoint(
      constrainedSurface.layer,
      constrainedSurface.canvas,
      documentPoint,
      false,
    )
    const selectionRect = constrainedSurface.selectionRect

    if (!startPoint || (selectionRect && !isPointInsideRect(startPoint, selectionRect))) {
      return
    }

    setGradientPreview({
      layerId: gradientLayer.id,
      layer: {
        x: constrainedSurface.layer.x,
        y: constrainedSurface.layer.y,
        width: constrainedSurface.layer.width,
        height: constrainedSurface.layer.height,
        rotation: constrainedSurface.layer.rotation,
        scaleX: constrainedSurface.layer.scaleX,
        scaleY: constrainedSurface.layer.scaleY,
      },
      surfaceWidth: constrainedSurface.canvas.width,
      surfaceHeight: constrainedSurface.canvas.height,
      startPoint,
      endPoint: startPoint,
    })

    interactionRef.current = {
      type: 'gradient',
      sourceLayerId: gradientLayer.id,
      workingLayer: constrainedSurface.layer,
      sourceLayer: {
        x: constrainedSurface.layer.x,
        y: constrainedSurface.layer.y,
        width: constrainedSurface.layer.width,
        height: constrainedSurface.layer.height,
        rotation: constrainedSurface.layer.rotation,
        scaleX: constrainedSurface.layer.scaleX,
        scaleY: constrainedSurface.layer.scaleY,
      },
      surfaceWidth: constrainedSurface.canvas.width,
      surfaceHeight: constrainedSurface.canvas.height,
      startPoint,
      endPoint: startPoint,
      mode: gradientMode,
      restoreCanvas: cloneCanvas(constrainedSurface.canvas),
      selectionRect,
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

  function beginRectSelection(event, layer) {
    event.stopPropagation()
    event.preventDefault()

    const rectLayer = resolveEditToolTarget(layer, canLassoLayer).layer ?? getActiveRectSelectionLayer()
    const startPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)

    if (!rectLayer || !startPoint) {
      return
    }

    setActiveSvgToolLayerId(
      rectLayer.type === 'image' && rectLayer.sourceKind === 'svg' ? rectLayer.id : null,
    )

    setFloatingSelection((currentSelection) => (
      currentSelection?.selectionKind === 'rect' ? null : currentSelection
    ))
    setRectSelection({
      rect: { x: startPoint.x, y: startPoint.y, width: 0, height: 0 },
      sourceLayerId: rectLayer.id,
      isDragging: true,
      isFloating: false,
      floatingCanvas: null,
      offsetX: 0,
      offsetY: 0,
    })

    interactionRef.current = {
      type: 'rect-select',
      layerId: rectLayer.id,
      startPoint,
      rect: { x: startPoint.x, y: startPoint.y, width: 0, height: 0 },
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

  async function createFloatingSelectionFromRect(mode, selectionOverride = rectSelection) {
    if (!selectionOverride?.rect) {
      return null
    }

    const sourceLayer = findLayer(documentState, selectionOverride.sourceLayerId)

    if (!sourceLayer || !canLassoLayer(sourceLayer)) {
      return null
    }

    const surfaceCanvas = await ensureRasterLayerSurface(sourceLayer)
    const surfaceEntry = rasterSurfacesRef.current.get(sourceLayer.id)

    if (!surfaceCanvas || !surfaceEntry?.offscreenCanvas) {
      return null
    }

    const documentSelection = createDocumentSelectionFromRect(
      selectionOverride.rect,
      selectionOverride.sourceLayerId,
    )
    const restoreCanvas = cloneCanvas(surfaceEntry.offscreenCanvas)
    const nextFloatingSelection = documentSelection
      ? createFloatingSelectionFromDocumentSelection(
        sourceLayer,
        restoreCanvas,
        documentSelection,
        mode,
        restoreCanvas,
      )
      : null

    if (!nextFloatingSelection) {
      return null
    }

    Object.assign(nextFloatingSelection, {
      selectionKind: 'rect',
    })

    if (mode === 'move') {
      clearSelectionFromCanvas(surfaceEntry.offscreenCanvas, nextFloatingSelection.sourceSelection)
      drawRasterLayer(sourceLayer.id)
    }

    setFloatingSelection(nextFloatingSelection)
    setRectSelection(null)
    selectDocumentLayer(sourceLayer.id)
    return nextFloatingSelection
  }

  async function beginRectSelectionDrag(event) {
    const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)

    if (!documentPoint) {
      return false
    }

    if (floatingSelection?.selectionKind === 'rect') {
      return beginFloatingSelectionDrag(event)
    }

    if (!rectSelection?.rect || !isPointInsideRect(documentPoint, rectSelection.rect)) {
      return false
    }

    event.stopPropagation()
    event.preventDefault()

    const nextFloatingSelection = await createFloatingSelectionFromRect('move')

    if (!nextFloatingSelection) {
      return false
    }

    interactionRef.current = {
      type: 'floating-selection-drag',
      offsetX: documentPoint.x - nextFloatingSelection.x,
      offsetY: documentPoint.y - nextFloatingSelection.y,
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

    const destinationOffset = getFloatingSelectionSourceOffset(sourceLayer, floatingSelection)

    if (!destinationOffset) {
      return
    }

    const destinationX = destinationOffset.x
    const destinationY = destinationOffset.y
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

    const nextLayerWidth = targetCanvas.width * floatingSelection.scaleX
    const nextLayerHeight = targetCanvas.height * floatingSelection.scaleY
    const sourceLayerTopLeft = getLayerTopLeft(sourceLayer)
    const nextLayerTopLeftX = sourceLayerTopLeft.x + (minimumX * floatingSelection.scaleX)
    const nextLayerTopLeftY = sourceLayerTopLeft.y + (minimumY * floatingSelection.scaleY)

    surfaceEntry.offscreenCanvas = targetCanvas
    drawRasterLayer(sourceLayer.id)

    commit((currentDocument) =>
      applyRasterizedLayerUpdate(
        currentDocument,
        sourceLayer.id,
        canvasToBitmap(targetCanvas),
        {
          ...topLeftToCenter(
            nextLayerTopLeftX,
            nextLayerTopLeftY,
            nextLayerWidth,
            nextLayerHeight,
          ),
          width: nextLayerWidth,
          height: nextLayerHeight,
        },
      ),
    )

    if (floatingSelection.selectionKind === 'rect') {
      setRectSelection(preserveSelection ? createRectSelectionFromFloating(floatingSelection) : null)
      setLassoSelection(null)
    } else {
      setLassoSelection(preserveSelection ? createSelectionFromFloating(
        floatingSelection,
        floatingSelection.sourceLayerId,
        {
          ...sourceLayer,
          ...topLeftToCenter(
            nextLayerTopLeftX,
            nextLayerTopLeftY,
            nextLayerWidth,
            nextLayerHeight,
          ),
          width: nextLayerWidth,
          height: nextLayerHeight,
        },
      ) : null)
      setRectSelection(null)
    }
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
        width: Math.max(1, Math.round(floatingSelection.width)),
        height: Math.max(1, Math.round(floatingSelection.height)),
        ...topLeftToCenter(
          floatingSelection.x,
          floatingSelection.y,
          Math.max(1, Math.round(floatingSelection.width)),
          Math.max(1, Math.round(floatingSelection.height)),
        ),
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

      if (floatingSelection.selectionKind === 'rect') {
        setRectSelection(createRectSelectionFromFloating(
          floatingSelection,
          newLayer.id,
        ))
        setLassoSelection(null)
      } else {
        const nextSelection = createSelectionFromFloating(floatingSelection, newLayer.id, newLayer)
        setLassoSelection(nextSelection ? {
          ...nextSelection,
          sourceLayerId: newLayer.id,
        } : null)
        setRectSelection(null)
      }
      setFloatingSelection(null)
      return
    }

    if (rectSelection?.rect) {
      const sourceLayer = findLayer(documentState, rectSelection.sourceLayerId)

      if (!sourceLayer || !canLassoLayer(sourceLayer)) {
        return
      }

      const sourceSurface = await ensureRasterLayerSurface(sourceLayer)
      const sourceEntry = rasterSurfacesRef.current.get(sourceLayer.id)

      if (!sourceSurface || !sourceEntry?.offscreenCanvas) {
        return
      }

      const extractedSelection = createFloatingSelectionFromDocumentSelection(
        sourceLayer,
        sourceEntry.offscreenCanvas,
        createDocumentSelectionFromRect(rectSelection.rect, rectSelection.sourceLayerId),
        'duplicate',
      )

      if (!extractedSelection) {
        return
      }

      const newLayer = createRasterLayer({
        name: `${sourceLayer.name} Selection`,
        width: Math.max(1, Math.round(extractedSelection.width)),
        height: Math.max(1, Math.round(extractedSelection.height)),
        ...topLeftToCenter(
          extractedSelection.x,
          extractedSelection.y,
          Math.max(1, Math.round(extractedSelection.width)),
          Math.max(1, Math.round(extractedSelection.height)),
        ),
        bitmap: canvasToBitmap(extractedSelection.canvas),
      })

      commit((currentDocument) => insertLayer(currentDocument, newLayer, sourceLayer.id))

      setRectSelection(createRectSelectionFromFloating(extractedSelection, newLayer.id))
      setLassoSelection(null)
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
      width: Math.max(1, Math.round(extractedCanvas.width)),
      height: Math.max(1, Math.round(extractedCanvas.height)),
      ...topLeftToCenter(
        extractedCanvas.x,
        extractedCanvas.y,
        Math.max(1, Math.round(extractedCanvas.width)),
        Math.max(1, Math.round(extractedCanvas.height)),
      ),
      bitmap: canvasToBitmap(extractedCanvas.canvas),
    })

    commit((currentDocument) => insertLayer(currentDocument, newLayer, sourceLayer.id))

    const nextSelection = createSelectionFromFloating(extractedCanvas, newLayer.id, newLayer)
    setLassoSelection(nextSelection ? {
      ...nextSelection,
      sourceLayerId: newLayer.id,
    } : null)
    setRectSelection(null)
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
    if (floatingSelection.selectionKind === 'rect') {
      setRectSelection(null)
    } else {
      setLassoSelection(null)
    }
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

  async function deleteSelectedRectRegion() {
    if (!rectSelection?.rect) {
      return
    }

    const sourceLayer = findLayer(documentState, rectSelection.sourceLayerId)

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
      createDocumentSelectionFromRect(rectSelection.rect, rectSelection.sourceLayerId),
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

    setRectSelection(null)
  }

  function handleLayerPointerDown(event, layer) {
    if (event.target instanceof HTMLElement) {
      flushPendingFontSizeInputDraft(event.target)
    }

    if (currentTool === 'zoom') {
      handleZoomPointer(event)
      return
    }

    if (currentTool === 'select' && editingTextLayerId) {
      if (layer.id === editingTextLayerId) {
        event.stopPropagation()
        event.preventDefault()
        commitTextEditing(editingTextLayerId)
        return
      }

      commitTextEditing(editingTextLayerId)
    }

    const resizeHandleHit = getActiveSelectionResizeHandleHit(event)

    if (resizeHandleHit?.layer) {
      startResize(event, resizeHandleHit.layer, resizeHandleHit.handle)
      return
    }

    if (currentTool === 'select') {
      handleSelectToolPointerDown(event, layer)
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

    if (currentTool === 'rectSelect') {
      event.stopPropagation()
      event.preventDefault()

      const rectLayer = getActiveRectSelectionLayer()

      if (!rectLayer) {
        return
      }

      void beginRectSelectionDrag(event).then((didStartDrag) => {
        if (didStartDrag) {
          return
        }

        if (floatingSelection) {
          void commitFloatingSelectionToLayer(false)
          return
        }

        if (rectSelection?.sourceLayerId === rectLayer.id) {
          const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)

          if (documentPoint && !isPointInsideRect(documentPoint, rectSelection.rect)) {
            setRectSelection(null)
          }
        }

        beginRectSelection(event, rectLayer)
      })
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
    if (event.target instanceof HTMLElement) {
      flushPendingFontSizeInputDraft(event.target)
    }

    if (currentTool === 'zoom') {
      handleZoomPointer(event)
      return
    }

    const resizeHandleHit = getActiveSelectionResizeHandleHit(event)

    if (resizeHandleHit?.layer) {
      startResize(event, resizeHandleHit.layer, resizeHandleHit.handle)
      return
    }

    if (isResizeHandleTarget(event.target)) {
      return
    }

    if (currentTool === 'select' && isSelectionFrameTarget(event.target)) {
      return
    }

    if (
      currentTool === 'select' &&
      editingTextLayerId &&
      event.target instanceof HTMLElement &&
      !event.target.closest('.canvas-layer')
    ) {
      event.stopPropagation()
      event.preventDefault()
      commitTextEditing(editingTextLayerId)
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

    if (currentTool === 'rectSelect') {
      void beginRectSelectionDrag(event).then((didStartDrag) => {
        if (didStartDrag) {
          return
        }

        if (!(event.target instanceof HTMLElement) || !event.target.closest('.canvas-layer')) {
          const rectLayer = getActiveRectSelectionLayer()

          if (floatingSelection) {
            void commitFloatingSelectionToLayer(false)
            return
          }

          if (rectSelection) {
            const documentPoint = toDocumentCoordinates(event, canvasRef.current, viewport, documentScale)

            if (documentPoint && !isPointInsideRect(documentPoint, rectSelection.rect)) {
              setRectSelection(null)
            }
          }

          if (rectLayer) {
            beginRectSelection(event, rectLayer)
          }
        }
      })

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
        clearDocumentSelectionExplicitly()
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

    if (selectedLayer.type === 'image' && key === 'cornerRadius') {
      const nextCornerRadius = clampLayerCornerRadius(
        selectedLayer.width,
        selectedLayer.height,
        resolvedValue,
      )

      applyCoalescedLayerAdjustment({
        layerId: selectedLayer.id,
        propertyKey: 'cornerRadius',
        startValue: selectedLayer.cornerRadius ?? 0,
        nextValue: nextCornerRadius,
        updater: {
          cornerRadius: nextCornerRadius,
        },
      })
      return
    }

    if (selectedLayer.type === 'text') {
      if (key === 'fontSize') {
        const nextFontSize = clampFontSizeInputValue(resolvedValue)

        applyCoalescedLayerAdjustment({
          layerId: selectedLayer.id,
          propertyKey: 'fontSize',
          startValue: selectedLayer.fontSize,
          nextValue: nextFontSize,
          updater: (layer) => (
            layer.type === 'text'
              ? updateTextStyle(layer, {
                fontSize: nextFontSize,
              })
              : layer
          ),
        })
        return
      }

      if (key === 'width') {
        applyCoalescedLayerAdjustment({
          layerId: selectedLayer.id,
          propertyKey: 'width',
          startValue: selectedLayer.width,
          nextValue: resolvedValue,
          updater: (layer) => (
            layer.type === 'text'
              ? applyInspectorSizeToLayer(layer, { width: resolvedValue })
              : layer
          ),
        })
        return
      }

      if (key === 'height') {
        applyCoalescedLayerAdjustment({
          layerId: selectedLayer.id,
          propertyKey: 'height',
          startValue: selectedLayer.height,
          nextValue: resolvedValue,
          updater: (layer) => (
            layer.type === 'text'
              ? applyInspectorSizeToLayer(layer, { height: resolvedValue })
              : layer
          ),
        })
        return
      }
    }

    applyCoalescedLayerAdjustment({
      layerId: selectedLayer.id,
      propertyKey: key,
      startValue: selectedLayer[key],
      nextValue: resolvedValue,
      updater: {
        [key]: resolvedValue,
      },
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

  function resolveTextLayerForDoubleClickEdit(documentPoint) {
    const selectedDocumentLayer = getSingleSelectedLayer(documentState)

    if (
      selectedDocumentLayer?.type === 'text' &&
      isPointInsideTextEditRegion(selectedDocumentLayer, documentPoint)
    ) {
      return selectedDocumentLayer
    }

    const topLayer = documentPoint
      ? resolveTopLayerAtPoint(documentPoint)
      : null

    return topLayer?.type === 'text' ? topLayer : null
  }

  function handleCanvasDoubleClick(event) {
    if (currentTool !== 'select' || editingTextLayerId) {
      return
    }

    const target = event.target instanceof HTMLElement ? event.target : null

    if (target?.closest('.resize-handle')) {
      return
    }

    const documentPoint = toDocumentCoordinates(
      event,
      canvasRef.current,
      viewport,
      documentScale,
    )
    const targetLayer = resolveTextLayerForDoubleClickEdit(documentPoint)

    if (!targetLayer) {
      return
    }

    event.stopPropagation()
    beginTextEditing(targetLayer)
  }

  function handleTextLayerDoubleClick(event, layer) {
    if (currentTool !== 'select' || editingTextLayerId || layer.type !== 'text') {
      return
    }

    event.stopPropagation()
    event.preventDefault()
    beginTextEditing(layer)
  }

  function beginTextEditing(layer) {
    if (layer.type !== 'text') {
      return
    }

    selectDocumentLayer(layer.id)
    setEditingTextLayerId(layer.id)
    setTextDraft(layer.text)
    textSelectionRef.current = {
      start: String(layer.text ?? '').length,
      end: String(layer.text ?? '').length,
    }
    setTextEditorSelection({
      start: String(layer.text ?? '').length,
      end: String(layer.text ?? '').length,
    })
    textSelectionRestoreRef.current = null
    preserveTextEditingBlurRef.current = false
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
    if (!layerId) {
      clearTextEditingSessionState()
      return
    }

    const nextText = textDraft.trim() ? textDraft : 'New Text'

    updateTextLayerContent(layerId, nextText)
    clearTextEditingSessionState()
  }

  function cancelTextEditing() {
    clearTextEditingSessionState()
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

    const isEditingText = (
      editorChromeEnabled &&
      layer.type === 'text' &&
      layer.id === editingTextLayerId
    )
    const showEraserCursor = editorChromeEnabled && currentTool === 'eraser' && isErasableLayer(layer)
    const showBucketCursor = editorChromeEnabled && currentTool === 'bucket' && canFillLayerWithBucket(layer)
    const showGradientCursor = editorChromeEnabled && currentTool === 'gradient' && canApplyGradientToLayer(layer)
    const showPenCursor = editorChromeEnabled && currentTool === 'pen' && canPaintWithPenOnLayer(layer)
    const showLassoCursor = editorChromeEnabled && currentTool === 'lasso' && canLassoLayer(layer)
    const showRectSelectCursor = editorChromeEnabled && currentTool === 'rectSelect' && canLassoLayer(layer)
    const textEditorOverlay = isEditingText
      ? getTextEditorOverlayGeometry(layer, textEditorSelection.start, textEditorSelection.end)
      : null
    const layerTopLeft = getLayerTopLeft(layer)

    return (
      <div
        key={layer.id}
        ref={(node) => registerLayerElement(layer.id, node)}
        className={!editorChromeEnabled
          ? 'canvas-layer canvas-layer-read-only'
          : showPenCursor
            ? 'canvas-layer pen-enabled'
            : showEraserCursor
              ? 'canvas-layer eraser-enabled'
              : showBucketCursor
                ? 'canvas-layer bucket-enabled'
                : showGradientCursor
                  ? 'canvas-layer gradient-enabled'
                  : showLassoCursor || showRectSelectCursor
                    ? 'canvas-layer lasso-enabled'
                    : 'canvas-layer'}
        style={{
          left: `${layerTopLeft.x}px`,
          top: `${layerTopLeft.y}px`,
          width: `${layer.width}px`,
          height: `${layer.height}px`,
          transform: `rotate(${layer.rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`,
          zIndex: index + 1,
        }}
        onPointerDown={editorChromeEnabled
          ? (event) => handleLayerPointerDown(event, layer)
          : undefined}
        onDoubleClick={editorChromeEnabled
          ? (event) => handleTextLayerDoubleClick(event, layer)
          : undefined}
      >
        <div className="layer-artwork" style={{ opacity: layer.opacity }}>
          {layer.type === 'text' && (
            isEditingText ? (
              <div className="layer-body text-layer-edit-shell">
                <canvas
                  ref={(node) => registerVisibleCanvas(layer.id, node)}
                  className="layer-body text-layer-canvas text-layer-edit-preview"
                  aria-hidden="true"
                />
                <div className="text-layer-edit-overlay" aria-hidden="true">
                  {textEditorOverlay?.selectionRects.map((rect, rectIndex) => (
                    <div
                      key={`${layer.id}-selection-${rectIndex}`}
                      className="text-layer-selection-rect"
                      style={{
                        left: `${rect.x}px`,
                        top: `${rect.y}px`,
                        width: `${rect.width}px`,
                        height: `${rect.height}px`,
                      }}
                    />
                  ))}
                  {textEditorOverlay?.caretRect && textEditorSelection.start === textEditorSelection.end && (
                    <div
                      className="text-layer-caret"
                      style={{
                        left: `${textEditorOverlay.caretRect.x}px`,
                        top: `${textEditorOverlay.caretRect.y}px`,
                        height: `${textEditorOverlay.caretRect.height}px`,
                      }}
                    />
                  )}
                </div>
                <textarea
                  ref={textEditorRef}
                  className="layer-body text-layer-body text-layer-editor"
                  dir={detectTextDirection(textDraft)}
                  value={textDraft}
                  style={{
                    fontFamily: layer.fontFamily,
                    fontSize: `${layer.fontSize}px`,
                    fontStyle: layer.fontStyle,
                    fontWeight: layer.fontWeight,
                    lineHeight: layer.lineHeight,
                    color: layer.color,
                    direction: detectTextDirection(textDraft),
                    unicodeBidi: 'plaintext',
                    textAlign: layer.textAlign ?? 'left',
                    paddingTop: `${textEditorOverlay?.paddingTop ?? 0}px`,
                    paddingRight: `${textEditorOverlay?.paddingRight ?? 0}px`,
                    paddingBottom: `${textEditorOverlay?.paddingBottom ?? 0}px`,
                    paddingLeft: `${textEditorOverlay?.paddingLeft ?? 0}px`,
                  }}
                  onChange={(event) => {
                    setTextDraft(event.target.value)
                    updateTextLayerContent(layer.id, event.target.value, true)
                    syncTextEditorSelection(event.target)
                  }}
                  onSelect={(event) => syncTextEditorSelection(event.target)}
                  onKeyUp={(event) => syncTextEditorSelection(event.target)}
                  onPointerUp={(event) => syncTextEditorSelection(event.target)}
                  onBlur={(event) => {
                    const relatedTarget = event.relatedTarget instanceof HTMLElement
                      ? event.relatedTarget
                      : null

                    if (
                      preserveTextEditingBlurRef.current ||
                      relatedTarget?.closest('[data-text-style-control="true"]')
                    ) {
                      textSelectionRestoreRef.current = {
                        ...textSelectionRef.current,
                      }
                      return
                    }

                    commitTextEditing(layer.id)
                  }}
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
              </div>
            ) : (
              <canvas
                ref={(node) => registerVisibleCanvas(layer.id, node)}
                className="layer-body text-layer-canvas"
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
            <div
              className="layer-body image-layer-body"
              style={{
                borderRadius: `${clampLayerCornerRadius(
                  layer.width,
                  layer.height,
                  layer.cornerRadius ?? 0,
                )}px`,
              }}
            >
              <img
                className="layer-image"
                src={layer.src}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            </div>
          ) : isRasterLayer(layer) && (
            <div
              className="layer-body image-layer-body"
              style={layer.type === 'image'
                ? {
                  borderRadius: `${clampLayerCornerRadius(
                    layer.width,
                    layer.height,
                    layer.cornerRadius ?? 0,
                  )}px`,
                }
                : undefined}
            >
              <canvas
                ref={(node) => registerVisibleCanvas(layer.id, node)}
                className="layer-image raster-layer-canvas"
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderLayerSelectionOverlay(layer, overlayType = 'passive', order = 0) {
    if (!layer || currentTool !== 'select') {
      return null
    }

    const isEditingText = layer.type === 'text' && layer.id === editingTextLayerId

    if (isEditingText) {
      return null
    }

    const layerTopLeft = getLayerTopLeft(layer)
    const sharedStyle = {
      left: `${layerTopLeft.x}px`,
      top: `${layerTopLeft.y}px`,
      width: `${layer.width}px`,
      height: `${layer.height}px`,
      transform: `rotate(${layer.rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`,
      zIndex: documentState.layers.length + 20 + order,
      ...(overlayType === 'interactive' ? selectedResizeHandleStyleVars : {}),
    }

    if (overlayType === 'interactive') {
      return (
        <div
          key={`selection-overlay-${layer.id}`}
          className="layer-selection-overlay selection-frame interactive"
          style={sharedStyle}
          onPointerDown={(event) => handleSingleSelectionFramePointerDown(event, layer)}
          onDoubleClick={(event) => handleTextLayerDoubleClick(event, layer)}
          aria-hidden="true"
        >
          {HANDLE_DIRECTIONS.map((handle) => (
            <button
              key={handle.key}
              className={`resize-handle handle-${handle.key}`}
              type="button"
              data-handle-direction={handle.key}
              onPointerDown={(event) => startResize(event, layer, handle)}
            />
          ))}
        </div>
      )
    }

    return (
      <div
        key={`selection-overlay-${layer.id}`}
        className="layer-selection-overlay selection-frame passive"
        style={sharedStyle}
        aria-hidden="true"
      />
    )
  }

  function renderLayerSelectionOverlays() {
    if (currentTool !== 'select' || selectedLayers.length === 0) {
      return null
    }

    if (hasMultiSelection) {
      return selectedLayers.map((layer, index) => renderLayerSelectionOverlay(layer, 'passive', index))
    }

    if (!selectedLayer) {
      return null
    }

    return renderLayerSelectionOverlay(selectedLayer, 'interactive')
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
          ...resizeHandleStyleVars,
          left: `${selectionBounds.x}px`,
          top: `${selectionBounds.y}px`,
          width: `${selectionBounds.width}px`,
          height: `${selectionBounds.height}px`,
        }}
        onPointerDown={(event) => {
          if (isResizeHandleTarget(event.target)) {
            return
          }

          startMove(event, primaryLayer)
        }}
        aria-hidden="true"
      >
        {HANDLE_DIRECTIONS.map((handle) => (
          <button
            key={handle.key}
            className={`resize-handle handle-${handle.key}`}
            type="button"
            data-handle-direction={handle.key}
            onPointerDown={(event) => startResize(event, primaryLayer, handle)}
          />
        ))}
      </div>
    )
  }

  function handleFirstEntryCanvasPointerDown(event) {
    event.preventDefault()
    event.stopPropagation()
  }

  function handleFirstEntryCanvasActivate(event) {
    event.preventDefault()
    event.stopPropagation()
    handleNewFile()
  }

  function renderFirstEntryCanvasOverlay() {
    if (!isFirstEntryCanvasVisible) {
      return null
    }

    return (
      <button
        className="canvas-first-entry-overlay"
        type="button"
        aria-label="Create a new post"
        onPointerDown={handleFirstEntryCanvasPointerDown}
        onClick={handleFirstEntryCanvasActivate}
      >
        <span className="canvas-first-entry-callout" aria-hidden="true">
          <span className="canvas-first-entry-plus">+</span>
        </span>
      </button>
    )
  }

  const fileAndSettingsSupport = (
    <>
      <input
        ref={openFileInputRef}
        className="sr-only"
        type="file"
        accept=".kryop,application/json"
        onChange={(event) => {
          void handleOpenFile(event)
        }}
      />
      <UnsavedChangesModal
        isOpen={isUnsavedChangesModalOpen}
        onClose={handleCancelUnsavedChanges}
        onDiscardAndCreateNew={handleDiscardAndCreateNew}
      />
      <NewFileModal
        isOpen={isNewFileModalOpen}
        name={newFileNameInput}
        width={newFileWidthInput}
        height={newFileHeightInput}
        minDimension={MIN_DOCUMENT_DIMENSION}
        onPresetSelect={handleSelectNewFilePreset}
        onClose={handleCancelNewFile}
        onNameChange={(event) => setNewFileNameInput(event.target.value)}
        onWidthChange={(event) => setNewFileWidthInput(event.target.value)}
        onHeightChange={(event) => setNewFileHeightInput(event.target.value)}
        onCreate={handleCreateNewFile}
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        theme={theme}
        trimTransparentImports={trimTransparentImports}
        onClose={() => setIsSettingsModalOpen(false)}
        onToggleTheme={() => setTheme((currentTheme) => (
          currentTheme === 'dark' ? 'light' : 'dark'
        ))}
        onToggleTrimTransparentImports={() => setTrimTransparentImports((currentValue) => !currentValue)}
      />
    </>
  )
  const fileAndSettingsControls = (
    <FileMenu
      fileMenuRef={fileMenuRef}
      isOpen={isFileMenuOpen}
      isOpeningFile={isOpeningFile}
      isExporting={isExporting}
      onToggle={() => setIsFileMenuOpen((currentValue) => !currentValue)}
      onOpenSettings={() => {
        setIsFileMenuOpen(false)
        setIsSettingsModalOpen(true)
      }}
      onNewFile={handleNewFile}
      onOpenFile={handleOpenFileClick}
      onSaveFile={handleSaveFile}
      onExport={handleExport}
    />
  )
  const inlineFileAndSettingsControls = (
    <FileMenu
      className="app-file-menu app-file-menu-inline"
      fileMenuRef={fileMenuRef}
      isOpen={isFileMenuOpen}
      isOpeningFile={isOpeningFile}
      isExporting={isExporting}
      onToggle={() => setIsFileMenuOpen((currentValue) => !currentValue)}
      onOpenSettings={() => {
        setIsFileMenuOpen(false)
        setIsSettingsModalOpen(true)
      }}
      onNewFile={handleNewFile}
      onOpenFile={handleOpenFileClick}
      onSaveFile={handleSaveFile}
      onExport={handleExport}
    />
  )
  const canvasCaptionArea = (
    <section className="canvas-caption-area" aria-label="Caption">
      <div className="canvas-caption-lines" aria-hidden="true">
        <span />
        <span />
      </div>
    </section>
  )
  const canvasUtilityPanels = (
    <>
      <aside className="canvas-slide-panel canvas-slide-panel-right" aria-label="Canvas side tools">
        <span className="canvas-slide-tab" aria-label="Tools">
          <img src={penTabIcon} alt="" aria-hidden="true" />
        </span>
        <div className="canvas-slide-actions">
          <button type="button">Tune</button>
          <button type="button">Crop</button>
          <button type="button">Mask</button>
          <button type="button">FX</button>
        </div>
      </aside>
      <aside className="canvas-slide-panel canvas-slide-panel-bottom" aria-label="Canvas lower side tools">
        <span className="canvas-slide-tab" aria-label="More">
          <img src={shareTabIcon} alt="" aria-hidden="true" />
        </span>
        <div className="canvas-slide-actions">
          <button type="button">Draft</button>
          <button type="button">Alt</button>
          <button type="button">Notes</button>
          <button type="button">Post</button>
        </div>
      </aside>
    </>
  )

  if (!editorChromeEnabled) {
    return (
      <main
        ref={appShellRef}
        className="app-shell editor-shell-minimal"
        data-theme={theme}
      >
        {fileAndSettingsSupport}
        {fileAndSettingsControls}
        <div className="editor-shell-layout editor-shell-layout-minimal">
          <PostSidebar
            posts={PLACEHOLDER_POST_SIDEBAR_POSTS}
            activePostId={activeSidebarPostId}
            onNewPost={handleNewFile}
            onSelectPost={setActiveSidebarPostId}
            logoHref="/"
            onLogoClick={() => navigateTo('/')}
          />
          <section className="editor-panel editor-panel-minimal">
            <div className="workspace-main-column editor-canvas-only" style={stageLayoutStyle}>
              <section className="canvas-panel canvas-panel-minimal" aria-label="Canvas panel">
                <div className="canvas-composer-shell">
                  {canvasUtilityPanels}
                  <div
                    ref={canvasRef}
                    className="canvas-stage canvas-stage-read-only"
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
                        {renderFirstEntryCanvasOverlay()}
                        {documentState.layers.map(renderLayer)}
                      </div>
                    </div>
                  </div>
                  {canvasCaptionArea}
                </div>
              </section>

              <PromptShell />
            </div>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main
      ref={appShellRef}
      className="app-shell"
      data-theme={theme}
      onPointerDownCapture={(event) => flushPendingFontSizeInputDraft(event.target)}
      onDragEnter={handleExternalImageDragEnter}
      onDragOver={handleExternalImageDragOver}
      onDragLeave={handleExternalImageDragLeave}
      onDrop={(event) => {
        void handleExternalImageDrop(event)
      }}
    >
      {fileAndSettingsSupport}
      <section className="editor-panel">
        <EditorToolbar
          startControls={inlineFileAndSettingsControls}
          icons={editorIcons}
          currentTool={currentTool}
          activeBrushTool={activeBrushTool}
          penSize={penSize}
          eraserSize={eraserSize}
          bucketTolerance={bucketTolerance}
          gradientMode={gradientMode}
          hasFloatingSelection={hasFloatingSelection}
          hasActiveLassoSelection={hasActiveLassoSelection}
          hasActiveRectSelection={hasActiveRectSelection}
          canUndo={canUndo || hasActiveInspectorAdjustment}
          canRedo={canRedo}
          toolPanelError={toolPanelError}
          onDismissToolPanelError={dismissToolPanelError}
          globalColors={globalColors}
          onActivateTool={activateTool}
          onResetViewport={() => setViewport({ zoom: 1, offsetX: 0, offsetY: 0 })}
          onPenSizeChange={setPenSize}
          onEraserSizeChange={setEraserSize}
          onBucketToleranceChange={(event) => setBucketTolerance(Number(event.target.value))}
          onGradientModeChange={(event) => setGradientMode(event.target.value)}
          onCommitFloatingSelectionToNewLayer={commitFloatingSelectionToNewLayer}
          onUndo={undo}
          onRedo={redo}
          onAddText={() =>
            addLayer(() =>
              createTextLayer({
                ...topLeftToCenter(120, 100, 280, 96),
                name: 'New Text',
              }),
            )
          }
          onAddImage={() => imageInputRef.current?.click()}
          onBackgroundChange={(event) => setBackground(event.target.value)}
          onForegroundChange={(event) => setForeground(event.target.value)}
          onSwapColors={swapColors}
          onResetColors={resetColors}
        />

        <div className="workspace-grid">
          <aside className="asset-sidebar">
            <AssetLibraryPanel
              icons={editorIcons}
              assetLibraryInputRef={assetLibraryInputRef}
              assetLibrary={assetLibrary}
              draggedAssetId={draggedAssetId}
              onImport={() => assetLibraryInputRef.current?.click()}
              onInputChange={handleAssetLibraryImport}
              onAssetDragStart={handleAssetDragStart}
              onAssetDragEnd={handleAssetDragEnd}
              onDeleteAsset={removeAssetFromLibrary}
            />
            <AddLayerPanel
              jsonInput={addLayerJsonInput}
              status={addLayerPanelStatus}
              selectedLayerType={addLayerPanelType}
              textFormValues={addLayerTextFormValues}
              imageFormValues={addLayerImageFormValues}
              fontFamilyOptions={FONT_FAMILY_OPTIONS}
              onJsonInputChange={setAddLayerJsonInput}
              onApplyJson={handleApplyAddLayerJson}
              onCreateFromJson={() => {
                void handleCreateLayersFromJson()
              }}
              onSelectedLayerTypeChange={setAddLayerPanelType}
              onTextFormChange={updateAddLayerTextField}
              onImageFormChange={updateAddLayerImageField}
              onCreateLayer={() => {
                void handleCreateAddLayer()
              }}
            />
          </aside>

          <div className="workspace-main-column" style={stageLayoutStyle}>
            <section className="canvas-panel">
              <div className="canvas-composer-shell">
                {canvasUtilityPanels}
                <div
                  ref={canvasRef}
                  className={[
                    'canvas-stage',
                    isCanvasAssetDropActive ? 'asset-drop-active' : '',
                    isExternalImageDragActive ? 'external-file-drop-active' : '',
                  ].filter(Boolean).join(' ')}
                  onPointerDown={handleCanvasPointerDown}
                  onDoubleClick={handleCanvasDoubleClick}
                  onDragOver={handleCanvasDragOver}
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
                  <ExternalImageDropOverlay isVisible={isExternalImageDragActive} />
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
                      {renderFirstEntryCanvasOverlay()}
                      {documentState.layers.map(renderLayer)}
                      {renderLayerSelectionOverlays()}
                      {renderSharedSelectionOverlay()}
                      <canvas ref={overlayCanvasRef} className="canvas-overlay" aria-hidden="true" />
                    </div>
                  </div>
                </div>
                {canvasCaptionArea}
              </div>
            </section>

            <PromptShell />
          </div>

          <aside className="sidebar">
            <input
              ref={imageInputRef}
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={handleImageImport}
            />
            <LayerPanel
              icons={editorIcons}
              documentState={documentState}
              documentWidth={documentWidth}
              documentHeight={documentHeight}
              draggedLayerId={draggedLayerId}
              layerDropTarget={layerDropTarget}
              addLayer={addLayer}
              applyDocumentChange={applyDocumentChange}
              createRasterLayer={createRasterLayer}
              handleLayerDragEnd={handleLayerDragEnd}
              handleLayerDragOver={handleLayerDragOver}
              handleLayerDragStart={handleLayerDragStart}
              handleLayerDrop={handleLayerDrop}
              handleMergeDown={handleMergeDown}
              onSelectLayer={selectDocumentLayer}
              onToggleLayerSelection={toggleDocumentLayerSelection}
            />

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
                        <FontSizeStepper
                          value={getDisplayedFontSizeValue(selectedLayer)}
                          min={MIN_FONT_SIZE}
                          max={MAX_FONT_SIZE}
                          inputRef={fontSizeInputRef}
                          inputPointerDown={markTextStyleControlInteraction}
                          onStepperPointerDown={(event) => {
                            event.preventDefault()
                            markTextStyleControlInteraction()
                          }}
                          onDecrementStep={() => handleTextFontSizeStep(selectedLayer.id, -1)}
                          onIncrementStep={() => handleTextFontSizeStep(selectedLayer.id, 1)}
                          onStepStop={finishCoalescedInspectorAdjustment}
                          onInputFocus={(event) => {
                            event.stopPropagation()
                            markTextStyleControlInteraction()
                            setFontSizeDraftValue(String(
                              getEditingSelectionStyleValue(selectedLayer, 'fontSize') ?? '',
                            ))
                          }}
                          onInputChange={(event) => {
                            event.stopPropagation()
                            setFontSizeDraftValue(event.target.value)
                          }}
                          onInputBlur={(event) => {
                            event.stopPropagation()
                            commitFontSizeInputDraft(selectedLayer.id)
                            finishCoalescedInspectorAdjustment()
                          }}
                          onInputKeyDown={(event) => {
                            event.stopPropagation()

                            if (event.key === 'Enter') {
                              event.preventDefault()
                              commitFontSizeInputDraft(selectedLayer.id)
                              event.currentTarget.blur()
                              return
                            }

                            if (event.key === 'Escape') {
                              event.preventDefault()
                              setFontSizeDraftValue(null)
                              event.currentTarget.blur()
                            }
                          }}
                        />
                        <label className="property-field">
                          <span>Weight</span>
                          <button
                            className={isEditingSelectionFullyBold(selectedLayer)
                              ? 'action-button active'
                              : 'action-button'}
                            type="button"
                            data-text-style-control="true"
                            onPointerDown={markTextStyleControlInteraction}
                            onClick={() =>
                              applyTextStyleChange(
                                selectedLayer.id,
                                (layer) => {
                                  const selection = getEditingTextSelectionRange(layer.id)

                                  if (selection) {
                                    const nextWeight = isTextRangeFullyBold(
                                      layer,
                                      selection.start,
                                      selection.end,
                                    )
                                      ? 400
                                      : 700

                                    return applyTextStyleToRange(layer, selection.start, selection.end, {
                                      fontWeight: nextWeight,
                                    })
                                  }

                                  return updateTextStyle(layer, {
                                    fontWeight: Number(layer.fontWeight) >= 700 ? 400 : 700,
                                  })
                                },
                              )
                            }
                          >
                            Bold
                          </button>
                        </label>
                        <label className="property-field">
                          <span>Font</span>
                          <select
                            value={getEditingSelectionStyleValue(selectedLayer, 'fontFamily') ?? selectedLayer.fontFamily}
                            data-text-style-control="true"
                            onPointerDown={markTextStyleControlInteraction}
                            onChange={(event) =>
                              applyTextStyleChange(selectedLayer.id, {
                                fontFamily: event.target.value,
                              })
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
                            max={MAX_LETTER_SPACING}
                            value={selectedLayer.letterSpacing ?? 0}
                            data-text-style-control="true"
                            onPointerDown={markTextStyleControlInteraction}
                            onChange={(event) => {
                              const nextLetterSpacing = clampLetterSpacingInputValue(event.target.value)
                              const selection = getEditingTextSelectionRange(selectedLayer.id)

                              applyCoalescedLayerAdjustment({
                                layerId: selectedLayer.id,
                                propertyKey: selection
                                  ? `letterSpacing:${selection.start}-${selection.end}`
                                  : 'letterSpacing',
                                startValue: getEditingSelectionStyleValue(selectedLayer, 'letterSpacing') ?? 0,
                                nextValue: nextLetterSpacing,
                                updater: (layer) => {
                                  if (layer.type !== 'text') {
                                    return layer
                                  }

                                  if (selection) {
                                    return applyTextStyleToRange(layer, selection.start, selection.end, {
                                      letterSpacing: nextLetterSpacing,
                                    })
                                  }

                                  return updateTextStyle(layer, {
                                    letterSpacing: nextLetterSpacing,
                                  })
                                },
                              })
                            }}
                            onBlur={finishCoalescedInspectorAdjustment}
                          />
                        </label>
                        <label className="property-field">
                          <span>Line Height</span>
                          <input
                            type="number"
                            min="0.5"
                            max={MAX_LINE_HEIGHT}
                            step="0.05"
                            value={selectedLayer.lineHeight ?? 1.15}
                            data-text-style-control="true"
                            onPointerDown={markTextStyleControlInteraction}
                            onChange={(event) => {
                              const nextLineHeight = clampLineHeightInputValue(event.target.value)
                              const selection = getEditingTextSelectionRange(selectedLayer.id)

                              applyCoalescedLayerAdjustment({
                                layerId: selectedLayer.id,
                                propertyKey: selection
                                  ? `lineHeight:${selection.start}-${selection.end}`
                                  : 'lineHeight',
                                startValue: getEditingSelectionStyleValue(selectedLayer, 'lineHeight') ?? 1.15,
                                nextValue: nextLineHeight,
                                updater: (layer) => {
                                  if (layer.type !== 'text') {
                                    return layer
                                  }

                                  if (selection) {
                                    return applyTextStyleToRange(layer, selection.start, selection.end, {
                                      lineHeight: nextLineHeight,
                                    })
                                  }

                                  return updateTextStyle(layer, {
                                    lineHeight: nextLineHeight,
                                  })
                                },
                              })
                            }}
                            onBlur={finishCoalescedInspectorAdjustment}
                          />
                        </label>
                        <label className="property-field">
                          <span>Color</span>
                          <input
                            type="color"
                            value={getEditingSelectionStyleValue(selectedLayer, 'color') ?? selectedLayer.color}
                            data-text-style-control="true"
                            onPointerDown={markTextStyleControlInteraction}
                            onChange={(event) =>
                              applyTextStyleChange(selectedLayer.id, {
                                color: event.target.value,
                              })
                            }
                          />
                        </label>
                        {!selectedLayer.isTextShadow && selectedLayerShadow && (
                          <>
                            <label className="property-field">
                              <span>Shadow X</span>
                              <input
                                type="number"
                                value={selectedLayerShadow.x - selectedLayer.x}
                                onChange={(event) => {
                                  const nextOffset = Number(event.target.value) || 0

                                  applyCoalescedLayerAdjustment({
                                    layerId: selectedLayerShadow.id,
                                    propertyKey: 'x',
                                    startValue: selectedLayerShadow.x,
                                    nextValue: selectedLayer.x + nextOffset,
                                    updater: {
                                      x: selectedLayer.x + nextOffset,
                                    },
                                  })
                                }}
                                onBlur={finishCoalescedInspectorAdjustment}
                              />
                            </label>
                            <label className="property-field">
                              <span>Shadow Y</span>
                              <input
                                type="number"
                                value={selectedLayerShadow.y - selectedLayer.y}
                                onChange={(event) => {
                                  const nextOffset = Number(event.target.value) || 0

                                  applyCoalescedLayerAdjustment({
                                    layerId: selectedLayerShadow.id,
                                    propertyKey: 'y',
                                    startValue: selectedLayerShadow.y,
                                    nextValue: selectedLayer.y + nextOffset,
                                    updater: {
                                      y: selectedLayer.y + nextOffset,
                                    },
                                  })
                                }}
                                onBlur={finishCoalescedInspectorAdjustment}
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
                                onChange={(event) => {
                                  const nextOpacity = Math.max(0, Math.min(1, Number(event.target.value) || 0))

                                  applyCoalescedLayerAdjustment({
                                    layerId: selectedLayerShadow.id,
                                    propertyKey: 'opacity',
                                    startValue: selectedLayerShadow.opacity,
                                    nextValue: nextOpacity,
                                    updater: {
                                      opacity: nextOpacity,
                                    },
                                  })
                                }}
                                onBlur={finishCoalescedInspectorAdjustment}
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
                        onBlur={finishCoalescedInspectorAdjustment}
                      />
                    </label>
                    <label className="property-field">
                      <span>Y</span>
                      <input
                        type="number"
                        value={selectedLayer.y}
                        onChange={(event) => handleNumericChange('y', event.target.value)}
                        onBlur={finishCoalescedInspectorAdjustment}
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
                        onBlur={finishCoalescedInspectorAdjustment}
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
                        onBlur={finishCoalescedInspectorAdjustment}
                      />
                    </label>
                    <label className="property-field">
                      <span>Rotation</span>
                      <input
                        type="number"
                        value={selectedLayer.rotation}
                        onChange={(event) => handleNumericChange('rotation', event.target.value)}
                        onBlur={finishCoalescedInspectorAdjustment}
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
                        onBlur={finishCoalescedInspectorAdjustment}
                      />
                    </label>
                    <LayerFlipControls
                      onFlipHorizontal={() =>
                        applyDocumentChange((currentDocument) => applyLayerDocumentUpdate(
                          currentDocument,
                          selectedLayer.id,
                          flipLayerHorizontal,
                        ))
                      }
                      onFlipVertical={() =>
                        applyDocumentChange((currentDocument) => applyLayerDocumentUpdate(
                          currentDocument,
                          selectedLayer.id,
                          flipLayerVertical,
                        ))
                      }
                    />
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
                            onChange={(event) => {
                              const nextBoxWidth = Math.max(
                                MIN_LAYER_WIDTH,
                                Number(event.target.value) || selectedLayer.width,
                              )

                              applyCoalescedLayerAdjustment({
                                layerId: selectedLayer.id,
                                propertyKey: 'boxWidth',
                                startValue: selectedLayer.boxWidth ?? selectedLayer.width,
                                nextValue: nextBoxWidth,
                                updater: (layer) => (
                                  layer.type === 'text'
                                    ? resizeBoxText(
                                      layer,
                                      nextBoxWidth,
                                      layer.boxHeight ?? layer.height,
                                    )
                                    : layer
                                ),
                              })
                            }}
                            onBlur={finishCoalescedInspectorAdjustment}
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
                            onBlur={finishCoalescedInspectorAdjustment}
                          />
                        </label>
                      </>
                    )}

                    {selectedLayer.type === 'image' && (
                      <>
                        <label className="property-field full-width">
                          <span>Rounded Corners</span>
                          <button
                            className={(selectedLayer.cornerRadius ?? 0) > 0
                              ? 'action-button active'
                              : 'action-button'}
                            type="button"
                            onClick={() => updateSelectedLayer({
                              cornerRadius: (selectedLayer.cornerRadius ?? 0) > 0
                                ? 0
                                : clampLayerCornerRadius(
                                  selectedLayer.width,
                                  selectedLayer.height,
                                  24,
                                ),
                            })}
                          >
                            {(selectedLayer.cornerRadius ?? 0) > 0 ? 'Rounded On' : 'Rounded Off'}
                          </button>
                        </label>
                        <label className="property-field">
                          <span>Corner Radius</span>
                          <input
                            type="number"
                            min="0"
                            max={Math.floor(Math.min(selectedLayer.width, selectedLayer.height) / 2)}
                            value={selectedLayer.cornerRadius ?? 0}
                            onChange={(event) => handleNumericChange('cornerRadius', event.target.value, 0)}
                            onBlur={finishCoalescedInspectorAdjustment}
                          />
                        </label>
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
