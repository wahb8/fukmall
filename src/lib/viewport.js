export function clampZoom(zoom, minZoom, maxZoom) {
  return Math.min(maxZoom, Math.max(minZoom, zoom))
}

export function screenToWorld(screenX, screenY, viewport) {
  return {
    x: (screenX - viewport.offsetX) / viewport.zoom,
    y: (screenY - viewport.offsetY) / viewport.zoom,
  }
}

export function worldToScreen(worldX, worldY, viewport) {
  return {
    x: (worldX * viewport.zoom) + viewport.offsetX,
    y: (worldY * viewport.zoom) + viewport.offsetY,
  }
}

export function getFittedStageMetrics(documentWidth, documentHeight, maxWidth, maxHeight) {
  const normalizedDocumentWidth = Number(documentWidth)
  const normalizedDocumentHeight = Number(documentHeight)
  const normalizedMaxWidth = Number(maxWidth)
  const normalizedMaxHeight = Number(maxHeight)
  const safeDocumentWidth = Number.isFinite(normalizedDocumentWidth) && normalizedDocumentWidth > 0
    ? normalizedDocumentWidth
    : 1
  const safeDocumentHeight = Number.isFinite(normalizedDocumentHeight) && normalizedDocumentHeight > 0
    ? normalizedDocumentHeight
    : 1
  const safeMaxWidth = Number.isFinite(normalizedMaxWidth) && normalizedMaxWidth > 0
    ? normalizedMaxWidth
    : safeDocumentWidth
  const safeMaxHeight = Number.isFinite(normalizedMaxHeight) && normalizedMaxHeight > 0
    ? normalizedMaxHeight
    : safeDocumentHeight
  const scale = Math.min(
    safeMaxWidth / safeDocumentWidth,
    safeMaxHeight / safeDocumentHeight,
  )

  return {
    width: safeDocumentWidth * scale,
    height: safeDocumentHeight * scale,
    scale,
  }
}

export function zoomAtPoint(
  viewport,
  screenX,
  screenY,
  zoomFactor,
  minZoom,
  maxZoom,
) {
  const worldPoint = screenToWorld(screenX, screenY, viewport)
  const nextZoom = clampZoom(viewport.zoom * zoomFactor, minZoom, maxZoom)

  return {
    zoom: nextZoom,
    offsetX: screenX - (worldPoint.x * nextZoom),
    offsetY: screenY - (worldPoint.y * nextZoom),
  }
}
