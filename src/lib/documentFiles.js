import { findLayer, normalizeLinkedLayerReferences } from './layers'

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

export function normalizeDocumentState(documentState) {
  const layers = normalizeLinkedLayerReferences(Array.isArray(documentState?.layers)
    ? documentState.layers.filter(isSupportedDocumentLayer)
    : [])
  const selectedLayerIds = Array.isArray(documentState?.selectedLayerIds)
    ? documentState.selectedLayerIds.filter((layerId) => findLayer({ layers }, layerId))
    : []
  const preferredLayerId = selectedLayerIds.at(-1) ?? documentState?.selectedLayerId ?? null
  const selectedLayerId = getFallbackSelectedLayerId({ layers }, preferredLayerId)

  return {
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
