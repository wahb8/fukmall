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
import { MIN_DOCUMENT_DIMENSION, MIN_LAYER_HEIGHT, MIN_LAYER_WIDTH } from './constants'

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
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
}

export function clampImportedImagePosition(x, y, width, height, documentWidth, documentHeight) {
  const maxX = documentWidth - width
  const maxY = documentHeight - height

  return {
    x: maxX >= 0 ? Math.min(Math.max(0, x), maxX) : 0,
    y: maxY >= 0 ? Math.min(Math.max(0, y), maxY) : 0,
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
