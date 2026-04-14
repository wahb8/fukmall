import {
  DEFAULT_TEXT_ALIGN,
  DEFAULT_TEXT_LETTER_SPACING,
  DEFAULT_TEXT_LINE_HEIGHT,
  DEFAULT_TEXT_MODE,
  syncTextLayerLayout,
} from './textLayer'
import { topLeftToCenter } from './layerGeometry'

const DEFAULT_LAYER_OPACITY = 1
export const DEFAULT_DOCUMENT_WIDTH = 1080
export const DEFAULT_DOCUMENT_HEIGHT = 1440
export const DEFAULT_DOCUMENT_NAME = 'Untitled'

function createBaseLayer(overrides) {
  const width = overrides?.width ?? 220
  const height = overrides?.height ?? 140
  const defaultPosition = topLeftToCenter(80, 80, width, height)

  return {
    id: crypto.randomUUID(),
    name: 'Layer',
    type: 'shape',
    visible: true,
    opacity: DEFAULT_LAYER_OPACITY,
    x: defaultPosition.x,
    y: defaultPosition.y,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    linkedLayerId: null,
    lockTransparentPixels: false,
    ...overrides,
  }
}

export function clampLayerCornerRadius(width, height, radius) {
  const numericRadius = Number(radius)

  if (!Number.isFinite(numericRadius)) {
    return 0
  }

  return Math.max(0, Math.min(
    numericRadius,
    Math.max(0, Number(width) || 0) / 2,
    Math.max(0, Number(height) || 0) / 2,
  ))
}

export function createDocument(
  layers = [],
  selectedLayerId = null,
  width = DEFAULT_DOCUMENT_WIDTH,
  height = DEFAULT_DOCUMENT_HEIGHT,
  name = DEFAULT_DOCUMENT_NAME,
) {
  const selectedLayerIds = selectedLayerId ? [selectedLayerId] : []

  return {
    name,
    width,
    height,
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
    fontFamily: 'Arial, sans-serif',
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
    styleRanges: [],
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

export function createTextShadowLayer(sourceLayer, overrides = {}) {
  return createTextLayer({
    ...sourceLayer,
    id: crypto.randomUUID(),
    name: `${sourceLayer.name} Shadow`,
    color: '#000000',
    opacity: overrides.opacity ?? 0.4,
    x: sourceLayer.x + (overrides.offsetX ?? 8),
    y: sourceLayer.y + (overrides.offsetY ?? 8),
    eraseMask: '',
    paintOverlayBitmap: '',
    shadowLayerId: null,
    isTextShadow: true,
    shadowSourceLayerId: sourceLayer.id,
    ...overrides,
  })
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
    ...overrides,
    bitmap: overrides.bitmap ?? overrides.src ?? '',
    sourceKind: overrides.sourceKind ?? 'bitmap',
    cornerRadius: clampLayerCornerRadius(
      overrides.width ?? 300,
      overrides.height ?? 220,
      overrides.cornerRadius ?? 0,
    ),
    fit: overrides.fit ?? 'fill',
  })
}

export function createRasterLayer(overrides = {}) {
  const width = overrides.width ?? DEFAULT_DOCUMENT_WIDTH
  const height = overrides.height ?? DEFAULT_DOCUMENT_HEIGHT
  const defaultPosition = topLeftToCenter(0, 0, width, height)

  return createBaseLayer({
    name: 'Drawing',
    type: 'raster',
    x: defaultPosition.x,
    y: defaultPosition.y,
    width,
    height,
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

export function normalizeLinkedLayerReferences(layers) {
  const safeLayers = Array.isArray(layers) ? layers : []
  const layerIds = new Set(safeLayers.map((layer) => layer.id))
  const sanitizedLayers = safeLayers.map((layer) => ({
    ...layer,
    linkedLayerId: (
      layer.linkedLayerId &&
      layer.linkedLayerId !== layer.id &&
      layerIds.has(layer.linkedLayerId)
    )
      ? layer.linkedLayerId
      : null,
  }))
  const layersById = new Map(sanitizedLayers.map((layer) => [layer.id, layer]))

  return sanitizedLayers.map((layer) => {
    if (!layer.linkedLayerId) {
      return layer
    }

    const linkedLayer = layersById.get(layer.linkedLayerId)

    if (!linkedLayer || linkedLayer.linkedLayerId !== layer.id) {
      return {
        ...layer,
        linkedLayerId: null,
      }
    }

    return layer
  })
}

export function appendLayer(documentState, layer) {
  return {
    ...documentState,
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
    ...documentState,
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
    linkedLayerId: null,
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
  return removeLayers(documentState, [layerId])
}

export function removeLayers(documentState, layerIds) {
  const idsToRemove = new Set(
    Array.isArray(layerIds)
      ? layerIds.filter((layerId) => findLayer(documentState, layerId))
      : [],
  )

  if (idsToRemove.size === 0) {
    return documentState
  }

  for (const layer of documentState.layers) {
    if (idsToRemove.has(layer.id)) {
      if (layer.type === 'text' && layer.shadowLayerId) {
        idsToRemove.add(layer.shadowLayerId)
      }

      continue
    }

    if (layer.type === 'text' && layer.shadowLayerId && idsToRemove.has(layer.shadowLayerId)) {
      idsToRemove.add(layer.shadowLayerId)
    }
  }

  const selectedLayerIds = Array.isArray(documentState.selectedLayerIds)
    ? documentState.selectedLayerIds
    : documentState.selectedLayerId
      ? [documentState.selectedLayerId]
      : []
  const nextLayersAfterRemoval = documentState.layers
    .filter((layer) => !idsToRemove.has(layer.id))
    .map((layer) => (
      ({
        ...layer,
        linkedLayerId: idsToRemove.has(layer.linkedLayerId) ? null : (layer.linkedLayerId ?? null),
        ...(layer.type === 'text' && layer.shadowLayerId && idsToRemove.has(layer.shadowLayerId)
          ? {
            shadowLayerId: null,
          }
          : {}),
      })
    ))
  const nextSelectedLayerIds = selectedLayerIds.filter((id) => !idsToRemove.has(id))
  const selectedLayerWasRemoved = documentState.selectedLayerId
    ? idsToRemove.has(documentState.selectedLayerId)
    : false
  const fallbackSelectedLayerId = nextLayersAfterRemoval.at(-1)?.id ?? null

  return {
    ...documentState,
    layers: nextLayersAfterRemoval,
    selectedLayerId: nextSelectedLayerIds.at(-1) ?? (
      selectedLayerWasRemoved ? fallbackSelectedLayerId : documentState.selectedLayerId
    ),
    selectedLayerIds: nextSelectedLayerIds.length > 0
      ? nextSelectedLayerIds
      : (selectedLayerWasRemoved && fallbackSelectedLayerId ? [fallbackSelectedLayerId] : []),
  }
}

export function linkLayerPair(documentState, firstLayerId, secondLayerId) {
  if (!firstLayerId || !secondLayerId || firstLayerId === secondLayerId) {
    return documentState
  }

  const firstLayer = findLayer(documentState, firstLayerId)
  const secondLayer = findLayer(documentState, secondLayerId)

  if (!firstLayer || !secondLayer) {
    return documentState
  }

  return {
    ...documentState,
    layers: documentState.layers.map((layer) => {
      if (layer.id === firstLayerId) {
        return {
          ...layer,
          linkedLayerId: secondLayerId,
        }
      }

      if (layer.id === secondLayerId) {
        return {
          ...layer,
          linkedLayerId: firstLayerId,
        }
      }

      if (layer.linkedLayerId === firstLayerId || layer.linkedLayerId === secondLayerId) {
        return {
          ...layer,
          linkedLayerId: null,
        }
      }

      return layer
    }),
  }
}

export function unlinkLayerPair(documentState, layerId) {
  const sourceLayer = findLayer(documentState, layerId)

  if (!sourceLayer?.linkedLayerId) {
    return documentState
  }

  const linkedLayerId = sourceLayer.linkedLayerId

  return {
    ...documentState,
    layers: documentState.layers.map((layer) => (
      layer.id === layerId ||
      layer.id === linkedLayerId ||
      layer.linkedLayerId === layerId ||
      layer.linkedLayerId === linkedLayerId
        ? {
          ...layer,
          linkedLayerId: null,
        }
        : layer
    )),
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
    ...documentState,
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
