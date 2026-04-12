import {
  clampLayerCornerRadius,
  DEFAULT_DOCUMENT_HEIGHT,
  DEFAULT_DOCUMENT_NAME,
  DEFAULT_DOCUMENT_WIDTH,
  findLayer,
  normalizeLinkedLayerReferences,
} from './layers'
import { normalizeTextStyleRanges } from './textLayer'

const PROJECT_APP_NAME = 'Fukmall'
const PROJECT_FORMAT_VERSION = 1

function getFallbackSelectedLayerId(documentState, preferredLayerId = null) {
  if (!documentState.layers.length) {
    return null
  }

  if (preferredLayerId && findLayer(documentState, preferredLayerId)) {
    return preferredLayerId
  }

  return documentState.layers.at(-1)?.id ?? null
}

function isSupportedDocumentLayer(layer) {
  return layer?.type !== 'group'
}

function normalizeDocumentLayer(layer) {
  if (layer?.type === 'image') {
    return {
      ...layer,
      cornerRadius: clampLayerCornerRadius(layer.width, layer.height, layer.cornerRadius ?? 0),
    }
  }

  if (layer?.type !== 'text') {
    return layer
  }

  return {
    ...layer,
    styleRanges: normalizeTextStyleRanges(layer.styleRanges, String(layer.text ?? '').length),
  }
}

function normalizeDocumentDimension(value, fallback) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.max(1, Math.round(numericValue))
}

function normalizeDocumentName(value) {
  if (typeof value !== 'string') {
    return DEFAULT_DOCUMENT_NAME
  }

  const trimmedValue = value.trim()

  return trimmedValue || DEFAULT_DOCUMENT_NAME
}

export function normalizeDocumentState(documentState) {
  const layers = normalizeLinkedLayerReferences(Array.isArray(documentState?.layers)
    ? documentState.layers
      .filter(isSupportedDocumentLayer)
      .map(normalizeDocumentLayer)
    : [])
  const name = normalizeDocumentName(documentState?.name)
  const width = normalizeDocumentDimension(documentState?.width, DEFAULT_DOCUMENT_WIDTH)
  const height = normalizeDocumentDimension(documentState?.height, DEFAULT_DOCUMENT_HEIGHT)
  const selectedLayerIds = Array.isArray(documentState?.selectedLayerIds)
    ? documentState.selectedLayerIds.filter((layerId) => findLayer({ layers }, layerId))
    : []
  const preferredLayerId = selectedLayerIds.at(-1) ?? documentState?.selectedLayerId ?? null
  const selectedLayerId = getFallbackSelectedLayerId({ layers }, preferredLayerId)

  return {
    name,
    width,
    height,
    layers,
    selectedLayerId,
    selectedLayerIds: selectedLayerId
      ? (selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId])
      : [],
  }
}

export function serializeProjectFile(documentState) {
  return JSON.stringify({
    app: PROJECT_APP_NAME,
    version: PROJECT_FORMAT_VERSION,
    document: normalizeDocumentState(documentState),
  })
}

export function parseProjectFile(fileText) {
  let parsedFile = null

  try {
    parsedFile = JSON.parse(fileText)
  } catch {
    throw new Error('This project file is not valid JSON.')
  }

  if (parsedFile?.app !== PROJECT_APP_NAME) {
    throw new Error('This file is not a Fukmall project file.')
  }

  if (parsedFile?.version !== PROJECT_FORMAT_VERSION) {
    throw new Error('This Fukmall project version is not supported.')
  }

  if (!parsedFile?.document || typeof parsedFile.document !== 'object') {
    throw new Error('This Fukmall project file is missing its document data.')
  }

  return normalizeDocumentState(parsedFile.document)
}

export function downloadProjectFile(documentState, filenameBase = 'fukmall-project') {
  const fileContents = serializeProjectFile(documentState)
  const blob = new Blob([fileContents], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)
  const downloadLink = document.createElement('a')

  downloadLink.href = objectUrl
  downloadLink.download = `${filenameBase}.kryop`
  document.body.append(downloadLink)
  downloadLink.click()
  downloadLink.remove()
  URL.revokeObjectURL(objectUrl)
}
