import {
  DEFAULT_TEXT_ALIGN,
  DEFAULT_TEXT_LETTER_SPACING,
  DEFAULT_TEXT_LINE_HEIGHT,
  DEFAULT_TEXT_MODE,
  syncTextLayerLayout,
} from './textLayer'

const DEFAULT_LAYER_OPACITY = 1

function createBaseLayer(overrides) {
  return {
    id: crypto.randomUUID(),
    name: 'Layer',
    type: 'shape',
    visible: true,
    opacity: DEFAULT_LAYER_OPACITY,
    x: 80,
    y: 80,
    width: 220,
    height: 140,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    lockTransparentPixels: false,
    ...overrides,
  }
}

export function createDocument(layers = [], selectedLayerId = null) {
  const selectedLayerIds = selectedLayerId ? [selectedLayerId] : []

  return {
    layers,
    selectedLayerId,
    selectedLayerIds,
  }
}

export function createTextLayer(overrides = {}) {
  const baseTextLayer = createBaseLayer({
    name: 'New Text',
    type: 'text',
    width: 280,
    height: 96,
    text: 'New Text',
    fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
    fontSize: 42,
    fontWeight: 400,
    fontStyle: 'normal',
    lineHeight: DEFAULT_TEXT_LINE_HEIGHT,
    letterSpacing: DEFAULT_TEXT_LETTER_SPACING,
    color: '#0f172a',
    textAlign: DEFAULT_TEXT_ALIGN,
    mode: DEFAULT_TEXT_MODE,
    boxWidth: null,
    boxHeight: null,
    measuredWidth: 0,
    measuredHeight: 0,
    eraseMask: '',
    paintOverlayBitmap: '',
    ...overrides,
  })

  const normalizedTextLayer = baseTextLayer.mode === 'box'
    ? {
      ...baseTextLayer,
      boxWidth: baseTextLayer.boxWidth ?? baseTextLayer.width,
      boxHeight: baseTextLayer.boxHeight ?? baseTextLayer.height,
    }
    : baseTextLayer

  return syncTextLayerLayout(normalizedTextLayer)
}

export function createShapeLayer(overrides = {}) {
  return createBaseLayer({
    name: 'Shape',
    type: 'shape',
    width: 220,
    height: 220,
    fill: '#ff7a59',
    radius: 28,
    ...overrides,
  })
}

export function createImageLayer(overrides = {}) {
  return createBaseLayer({
    name: 'Image',
    type: 'image',
    width: 300,
    height: 220,
    src: '',
    bitmap: overrides.bitmap ?? overrides.src ?? '',
    sourceKind: 'bitmap',
    fit: 'fill',
    ...overrides,
  })
}

export function createRasterLayer(overrides = {}) {
  return createBaseLayer({
    name: 'Drawing',
    type: 'raster',
    x: 0,
    y: 0,
    width: 1080,
    height: 1440,
    bitmap: '',
    ...overrides,
  })
}

export function createGroupLayer(overrides = {}) {
  return createBaseLayer({
    name: 'Group',
    type: 'group',
    width: 320,
    height: 220,
    childIds: [],
    ...overrides,
  })
}

export function findLayer(documentState, layerId) {
  return documentState.layers.find((layer) => layer.id === layerId) ?? null
}

export function updateLayer(documentState, layerId, updater) {
  return {
    ...documentState,
    layers: documentState.layers.map((layer) => {
      if (layer.id !== layerId) {
        return layer
      }

      return typeof updater === 'function' ? updater(layer) : { ...layer, ...updater }
    }),
  }
}

export function appendLayer(documentState, layer) {
  return {
    layers: [...documentState.layers, layer],
    selectedLayerId: layer.id,
    selectedLayerIds: [layer.id],
  }
}

export function insertLayer(documentState, layer, afterLayerId = null) {
  if (!afterLayerId) {
    return appendLayer(documentState, layer)
  }

  const currentIndex = documentState.layers.findIndex((candidate) => candidate.id === afterLayerId)

  if (currentIndex === -1) {
    return appendLayer(documentState, layer)
  }

  const nextLayers = [...documentState.layers]
  nextLayers.splice(currentIndex + 1, 0, layer)

  return {
    layers: nextLayers,
    selectedLayerId: layer.id,
    selectedLayerIds: [layer.id],
  }
}

export function duplicateLayer(documentState, layerId) {
  const sourceLayer = findLayer(documentState, layerId)

  if (!sourceLayer) {
    return documentState
  }

  const duplicatedLayer = cloneLayer(sourceLayer)

  return insertLayer(documentState, duplicatedLayer, layerId)
}

export function cloneLayer(layer, overrides = {}) {
  return {
    ...layer,
    id: crypto.randomUUID(),
    name: `${layer.name} Copy`,
    childIds: Array.isArray(layer.childIds) ? [...layer.childIds] : layer.childIds,
    ...overrides,
  }
}

export function selectLayer(documentState, layerId) {
  return {
    ...documentState,
    selectedLayerId: layerId,
    selectedLayerIds: layerId ? [layerId] : [],
  }
}

export function clearSelection(documentState) {
  return {
    ...documentState,
    selectedLayerId: null,
    selectedLayerIds: [],
  }
}

export function selectSingleLayer(documentState, layerId) {
  return selectLayer(documentState, layerId)
}

export function toggleLayerInSelection(documentState, layerId) {
  const selectedLayerIds = Array.isArray(documentState.selectedLayerIds)
    ? documentState.selectedLayerIds
    : documentState.selectedLayerId
      ? [documentState.selectedLayerId]
      : []
  const isSelected = selectedLayerIds.includes(layerId)
  const nextSelectedLayerIds = isSelected
    ? selectedLayerIds.filter((id) => id !== layerId)
    : [...selectedLayerIds, layerId]

  return {
    ...documentState,
    selectedLayerId: nextSelectedLayerIds.at(-1) ?? null,
    selectedLayerIds: nextSelectedLayerIds,
  }
}

export function isLayerSelected(documentState, layerId) {
  return Array.isArray(documentState.selectedLayerIds)
    ? documentState.selectedLayerIds.includes(layerId)
    : documentState.selectedLayerId === layerId
}

export function getSelectedLayers(documentState) {
  const selectedLayerIds = Array.isArray(documentState.selectedLayerIds)
    ? documentState.selectedLayerIds
    : documentState.selectedLayerId
      ? [documentState.selectedLayerId]
      : []

  return documentState.layers.filter((layer) => selectedLayerIds.includes(layer.id))
}

export function removeLayer(documentState, layerId) {
  const nextLayers = documentState.layers.filter((layer) => layer.id !== layerId)
  const selectedLayerIds = Array.isArray(documentState.selectedLayerIds)
    ? documentState.selectedLayerIds
    : documentState.selectedLayerId
      ? [documentState.selectedLayerId]
      : []
  const nextSelectedLayerIds = selectedLayerIds.filter((id) => id !== layerId)

  return {
    layers: nextLayers,
    selectedLayerId: nextSelectedLayerIds.at(-1) ?? (
      documentState.selectedLayerId === layerId ? nextLayers.at(-1)?.id ?? null : documentState.selectedLayerId
    ),
    selectedLayerIds: nextSelectedLayerIds.length > 0
      ? nextSelectedLayerIds
      : (documentState.selectedLayerId === layerId && nextLayers.at(-1)?.id ? [nextLayers.at(-1).id] : []),
  }
}

export function moveLayer(documentState, layerId, direction) {
  const currentIndex = documentState.layers.findIndex((layer) => layer.id === layerId)

  if (currentIndex === -1) {
    return documentState
  }

  const targetIndex = direction === 'up' ? currentIndex + 1 : currentIndex - 1

  if (targetIndex < 0 || targetIndex >= documentState.layers.length) {
    return documentState
  }

  const nextLayers = [...documentState.layers]
  const [movedLayer] = nextLayers.splice(currentIndex, 1)
  nextLayers.splice(targetIndex, 0, movedLayer)

  return {
    ...documentState,
    layers: nextLayers,
  }
}

export function moveLayerToIndex(documentState, layerId, targetIndex) {
  const currentIndex = documentState.layers.findIndex((layer) => layer.id === layerId)

  if (currentIndex === -1) {
    return documentState
  }

  const boundedTargetIndex = Math.max(0, Math.min(targetIndex, documentState.layers.length - 1))

  if (currentIndex === boundedTargetIndex) {
    return documentState
  }

  const nextLayers = [...documentState.layers]
  const [movedLayer] = nextLayers.splice(currentIndex, 1)
  const insertionIndex = currentIndex < boundedTargetIndex
    ? boundedTargetIndex
    : boundedTargetIndex

  nextLayers.splice(insertionIndex, 0, movedLayer)

  return {
    ...documentState,
    layers: nextLayers,
  }
}

export function getLayerBelow(documentState, layerId) {
  const currentIndex = documentState.layers.findIndex((layer) => layer.id === layerId)

  if (currentIndex <= 0) {
    return null
  }

  return documentState.layers[currentIndex - 1] ?? null
}

export function isSvgImageLayer(layer) {
  return layer?.type === 'image' && layer?.sourceKind === 'svg'
}

export function canMergeDown(documentState, layerId = documentState.selectedLayerId) {
  if (!layerId) {
    return false
  }

  const currentLayer = findLayer(documentState, layerId)
  const layerBelow = getLayerBelow(documentState, layerId)

  if (!currentLayer || !layerBelow) {
    return false
  }

  return !isSvgImageLayer(currentLayer) && !isSvgImageLayer(layerBelow)
}

export function mergeLayerDown(documentState, selectedLayerId, mergedLayer) {
  const selectedIndex = documentState.layers.findIndex((layer) => layer.id === selectedLayerId)

  if (selectedIndex <= 0) {
    return documentState
  }

  const currentLayer = documentState.layers[selectedIndex]
  const layerBelow = documentState.layers[selectedIndex - 1]

  if (isSvgImageLayer(currentLayer) || isSvgImageLayer(layerBelow)) {
    return documentState
  }

  const nextLayers = [...documentState.layers]
  nextLayers.splice(selectedIndex - 1, 2, mergedLayer)

  return {
    layers: nextLayers,
    selectedLayerId: mergedLayer.id,
    selectedLayerIds: [mergedLayer.id],
  }
}

export function isRasterLayer(layer) {
  return layer?.type === 'image' || layer?.type === 'raster'
}

export function isErasableLayer(layer) {
  return isRasterLayer(layer) || layer?.type === 'text'
}

export function canLayerLockTransparentPixels(layer) {
  return layer?.type === 'raster' || layer?.type === 'image' || layer?.type === 'text'
}

export function isAlphaLocked(layer) {
  return Boolean(layer?.lockTransparentPixels)
}

export function setLayerAlphaLock(documentState, layerId, enabled) {
  return updateLayer(documentState, layerId, {
    lockTransparentPixels: Boolean(enabled),
  })
}

export function toggleLayerAlphaLock(documentState, layerId) {
  const layer = findLayer(documentState, layerId)

  if (!layer || !canLayerLockTransparentPixels(layer)) {
    return documentState
  }

  return setLayerAlphaLock(documentState, layerId, !isAlphaLocked(layer))
}
