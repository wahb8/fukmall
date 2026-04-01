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
