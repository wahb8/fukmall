export function getLayerScale(layer) {
  return {
    scaleX: layer?.scaleX ?? 1,
    scaleY: layer?.scaleY ?? 1,
  }
}

export function getScaledLayerSize(layer) {
  const { scaleX, scaleY } = getLayerScale(layer)

  return {
    width: (layer?.width ?? 0) * Math.abs(scaleX),
    height: (layer?.height ?? 0) * Math.abs(scaleY),
  }
}

export function topLeftToCenter(x, y, width, height) {
  return {
    x: x + ((width ?? 0) / 2),
    y: y + ((height ?? 0) / 2),
  }
}

export function centerToTopLeft(x, y, width, height) {
  return {
    x: x - ((width ?? 0) / 2),
    y: y - ((height ?? 0) / 2),
  }
}

export function getLayerTopLeft(layer) {
  return centerToTopLeft(layer?.x ?? 0, layer?.y ?? 0, layer?.width ?? 0, layer?.height ?? 0)
}

export function getBoundsFromCenter(centerX, centerY, width, height) {
  const topLeft = centerToTopLeft(centerX, centerY, width, height)

  return {
    left: topLeft.x,
    top: topLeft.y,
    right: topLeft.x + width,
    bottom: topLeft.y + height,
    width,
    height,
    centerX,
    centerY,
  }
}

export function getLayerBoundsFromCenter(layer) {
  const { width, height } = getScaledLayerSize(layer)

  return getBoundsFromCenter(layer?.x ?? 0, layer?.y ?? 0, width, height)
}

export function getLayerTransformBounds(layer) {
  const centerX = layer?.x ?? 0
  const centerY = layer?.y ?? 0
  const angle = ((layer?.rotation ?? 0) * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const halfWidth = (layer?.width ?? 0) / 2
  const halfHeight = (layer?.height ?? 0) / 2
  const { scaleX, scaleY } = getLayerScale(layer)
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((point) => {
    const scaledX = point.x * scaleX
    const scaledY = point.y * scaleY

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

export function toLayerLocalPoint(layer, documentPoint) {
  if (!layer || !documentPoint) {
    return null
  }

  const { scaleX, scaleY } = getLayerScale(layer)

  if (
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    Math.abs(scaleX) < 0.0001 ||
    Math.abs(scaleY) < 0.0001
  ) {
    return null
  }

  const angle = ((layer.rotation ?? 0) * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const centerX = layer.x ?? 0
  const centerY = layer.y ?? 0
  const deltaX = documentPoint.x - centerX
  const deltaY = documentPoint.y - centerY
  const scaledX = (deltaX * cosine) + (deltaY * sine)
  const scaledY = (-deltaX * sine) + (deltaY * cosine)

  return {
    x: (scaledX / scaleX) + ((layer.width ?? 0) / 2),
    y: (scaledY / scaleY) + ((layer.height ?? 0) / 2),
  }
}

export function layerLocalPointToDocumentPoint(layer, surfaceWidth, surfaceHeight, point) {
  if (!layer || !point || surfaceWidth <= 0 || surfaceHeight <= 0) {
    return null
  }

  const normalizedX = (point.x / surfaceWidth) * layer.width
  const normalizedY = (point.y / surfaceHeight) * layer.height
  const angle = ((layer.rotation ?? 0) * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const centeredX = (normalizedX - (layer.width / 2)) * (layer.scaleX ?? 1)
  const centeredY = (normalizedY - (layer.height / 2)) * (layer.scaleY ?? 1)

  return {
    x: layer.x + (centeredX * cosine) - (centeredY * sine),
    y: layer.y + (centeredX * sine) + (centeredY * cosine),
  }
}

export function normalizeLayerCenterPosition(layer) {
  if (!layer) {
    return layer
  }

  return {
    ...layer,
    ...topLeftToCenter(layer.x ?? 0, layer.y ?? 0, layer.width ?? 0, layer.height ?? 0),
  }
}
