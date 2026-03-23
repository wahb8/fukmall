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
    ...overrides,
  }
}

export function createDocument(layers = [], selectedLayerId = null) {
  return {
    layers,
    selectedLayerId,
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
    width: 760,
    height: 570,
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
  }
}

export function selectLayer(documentState, layerId) {
  return {
    ...documentState,
    selectedLayerId: layerId,
  }
}

export function removeLayer(documentState, layerId) {
  const nextLayers = documentState.layers.filter((layer) => layer.id !== layerId)

  return {
    layers: nextLayers,
    selectedLayerId: documentState.selectedLayerId === layerId ? nextLayers.at(-1)?.id ?? null : documentState.selectedLayerId,
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

export function isRasterLayer(layer) {
  return layer?.type === 'image' || layer?.type === 'raster'
}

export function isErasableLayer(layer) {
  return isRasterLayer(layer) || layer?.type === 'text'
}
