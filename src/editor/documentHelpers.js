import heroImage from '../assets/hero.png'
import {
  createDocument,
  createImageLayer,
  createShapeLayer,
  createTextLayer,
  DEFAULT_DOCUMENT_HEIGHT,
  DEFAULT_DOCUMENT_NAME,
  DEFAULT_DOCUMENT_WIDTH,
} from '../lib/layers'
import { topLeftToCenter } from '../lib/layerGeometry'
import { inferImageSourceKindFromSrc } from '../lib/raster'
import { MIN_DOCUMENT_DIMENSION, MIN_LAYER_HEIGHT, MIN_LAYER_WIDTH } from './constants'

export const DEFAULT_IMPORT_TRIM_ALPHA_THRESHOLD = 8
export const DEFAULT_IMPORT_TRIM_PADDING = 1

export function createInitialDocument(
  width = DEFAULT_DOCUMENT_WIDTH,
  height = DEFAULT_DOCUMENT_HEIGHT,
  name = DEFAULT_DOCUMENT_NAME,
) {
  const scaleX = width / DEFAULT_DOCUMENT_WIDTH
  const scaleY = height / DEFAULT_DOCUMENT_HEIGHT
  const whiteBackground = createShapeLayer({
    name: 'Background',
    ...topLeftToCenter(0, 0, width, height),
    width,
    height,
    fill: '#ffffff',
    radius: 0,
  })
  const background = createImageLayer({
    name: 'Hero Image',
    ...topLeftToCenter(
      Math.round(76 * scaleX),
      Math.round(62 * scaleY),
      Math.max(MIN_LAYER_WIDTH, Math.round(360 * scaleX)),
      Math.max(MIN_LAYER_HEIGHT, Math.round(260 * scaleY)),
    ),
    width: Math.max(MIN_LAYER_WIDTH, Math.round(360 * scaleX)),
    height: Math.max(MIN_LAYER_HEIGHT, Math.round(260 * scaleY)),
    src: heroImage,
    bitmap: heroImage,
  })
  const card = createShapeLayer({
    name: 'Color Block',
    ...topLeftToCenter(
      Math.round(340 * scaleX),
      Math.round(120 * scaleY),
      Math.max(MIN_LAYER_WIDTH, Math.round(220 * scaleX)),
      Math.max(MIN_LAYER_HEIGHT, Math.round(220 * scaleY)),
    ),
    width: Math.max(MIN_LAYER_WIDTH, Math.round(220 * scaleX)),
    height: Math.max(MIN_LAYER_HEIGHT, Math.round(220 * scaleY)),
    fill: '#f97316',
    radius: 34,
  })
  const title = createTextLayer({
    name: 'Headline',
    ...topLeftToCenter(
      Math.round(126 * scaleX),
      Math.round(114 * scaleY),
      Math.max(MIN_LAYER_WIDTH, Math.round(300 * scaleX)),
      Math.max(MIN_LAYER_HEIGHT, Math.round(120 * scaleY)),
    ),
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

export function normalizeNewFileDimensionInput(value, fallback) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.max(MIN_DOCUMENT_DIMENSION, Math.round(numericValue))
}

export function normalizeNewFileNameInput(value, fallback = DEFAULT_DOCUMENT_NAME) {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmedValue = value.trim()

  return trimmedValue || fallback
}

export function getDocumentFilenameBase(name, fallback) {
  const normalizedName = normalizeNewFileNameInput(name, fallback)
  const sanitizedName = normalizedName
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .trim()

  return sanitizedName || fallback
}

export function getImportedImageDimensions(width, height) {
  const normalizedWidth = Number(width)
  const normalizedHeight = Number(height)

  if (
    !Number.isFinite(normalizedWidth) ||
    !Number.isFinite(normalizedHeight) ||
    normalizedWidth <= 0 ||
    normalizedHeight <= 0
  ) {
    return null
  }

  return {
    width: Math.max(1, Math.round(normalizedWidth)),
    height: Math.max(1, Math.round(normalizedHeight)),
  }
}

export function clampImportedImagePosition(x, y, width, height, documentWidth, documentHeight) {
  const normalizedX = Number.isFinite(Number(x)) ? Number(x) : 0
  const normalizedY = Number.isFinite(Number(y)) ? Number(y) : 0
  const normalizedWidth = Number.isFinite(Number(width)) ? Number(width) : 1
  const normalizedHeight = Number.isFinite(Number(height)) ? Number(height) : 1
  const normalizedDocumentWidth = Number.isFinite(Number(documentWidth))
    ? Number(documentWidth)
    : DEFAULT_DOCUMENT_WIDTH
  const normalizedDocumentHeight = Number.isFinite(Number(documentHeight))
    ? Number(documentHeight)
    : DEFAULT_DOCUMENT_HEIGHT
  const maxX = normalizedDocumentWidth - normalizedWidth
  const maxY = normalizedDocumentHeight - normalizedHeight

  return {
    x: maxX >= 0 ? Math.min(Math.max(0, normalizedX), maxX) : 0,
    y: maxY >= 0 ? Math.min(Math.max(0, normalizedY), maxY) : 0,
  }
}

export function getDefaultImportedImagePosition(
  width,
  height,
  documentWidth,
  documentHeight,
) {
  return clampImportedImagePosition(
    Math.round((documentWidth - width) / 2),
    Math.round((documentHeight - height) / 2),
    width,
    height,
    documentWidth,
    documentHeight,
  )
}

export function normalizeImportedImageSourceKind(sourceKind, src) {
  const inferredSourceKind = inferImageSourceKindFromSrc(src)

  return sourceKind === 'svg' && inferredSourceKind === 'svg'
    ? 'svg'
    : inferredSourceKind
}

export function shouldTrimTransparentImport({
  enabled,
  sourceKind,
  formatHint,
  src,
}) {
  if (!enabled) {
    return false
  }

  if (normalizeImportedImageSourceKind(sourceKind, src) === 'svg') {
    return false
  }

  const normalizedFormatHint = typeof formatHint === 'string'
    ? formatHint.trim().toLowerCase()
    : ''

  if (normalizedFormatHint === 'jpg' || normalizedFormatHint === 'jpeg') {
    return false
  }

  return true
}

export function createValidatedImportedImageLayer({
  name,
  src,
  width,
  height,
  documentWidth,
  documentHeight,
  topLeftX = null,
  topLeftY = null,
  sourceKind,
}) {
  if (typeof src !== 'string' || src.trim().length === 0) {
    throw new Error('Imported image source is invalid.')
  }

  const dimensions = getImportedImageDimensions(width, height)

  if (!dimensions) {
    throw new Error('Imported image dimensions are invalid.')
  }

  const hasExplicitTopLeft = Number.isFinite(Number(topLeftX)) && Number.isFinite(Number(topLeftY))
  const position = hasExplicitTopLeft
    ? clampImportedImagePosition(
      Number(topLeftX),
      Number(topLeftY),
      dimensions.width,
      dimensions.height,
      documentWidth,
      documentHeight,
    )
    : getDefaultImportedImagePosition(
      dimensions.width,
      dimensions.height,
      documentWidth,
      documentHeight,
    )

  return createImageLayer({
    ...topLeftToCenter(position.x, position.y, dimensions.width, dimensions.height),
    width: dimensions.width,
    height: dimensions.height,
    name: name?.trim() || 'Imported Image',
    src,
    bitmap: src,
    sourceKind: normalizeImportedImageSourceKind(sourceKind, src),
    fit: 'fill',
  })
}

export function createImageLayerBitmapPatch(layer, bitmap, overrides = {}) {
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

export function createBitmapEditableLayerPatch(layer, bitmap, overrides = {}) {
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
