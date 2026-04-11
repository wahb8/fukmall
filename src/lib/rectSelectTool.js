import { createSizedCanvas } from './raster'

export function createRectFromPoints(start, end) {
  if (!start || !end) {
    return null
  }

  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const right = Math.max(start.x, end.x)
  const bottom = Math.max(start.y, end.y)

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

export function rectToBounds(rect) {
  if (!rect) {
    return null
  }

  const left = Math.floor(rect.x)
  const top = Math.floor(rect.y)
  const right = Math.ceil(rect.x + rect.width)
  const bottom = Math.ceil(rect.y + rect.height)

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

export function extractRectSelection(sourceCanvas, rect) {
  const bounds = rectToBounds(rect)

  if (!sourceCanvas || !bounds || bounds.width <= 0 || bounds.height <= 0) {
    return null
  }

  const outputCanvas = createSizedCanvas(bounds.width, bounds.height)
  const context = outputCanvas.getContext('2d')

  if (!context) {
    return null
  }

  context.drawImage(
    sourceCanvas,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  )

  return outputCanvas
}

export function clearRectSelection(targetCanvas, rect) {
  const bounds = rectToBounds(rect)

  if (!targetCanvas || !bounds || bounds.width <= 0 || bounds.height <= 0) {
    return
  }

  const context = targetCanvas.getContext('2d')

  if (!context) {
    return
  }

  context.clearRect(bounds.left, bounds.top, bounds.width, bounds.height)
}

export function renderRectSelection(context, rect) {
  if (!context || !rect || rect.width <= 0 || rect.height <= 0) {
    return
  }

  context.save()
  context.fillStyle = 'rgba(15, 118, 110, 0.12)'
  context.fillRect(rect.x, rect.y, rect.width, rect.height)
  context.setLineDash([8, 6])
  context.lineWidth = 1.5
  context.strokeStyle = '#ffffff'
  context.strokeRect(rect.x, rect.y, rect.width, rect.height)
  context.lineDashOffset = 7
  context.strokeStyle = '#0f766e'
  context.strokeRect(rect.x, rect.y, rect.width, rect.height)
  context.restore()
}

export function isPointInsideRect(point, rect) {
  if (!point || !rect) {
    return false
  }

  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

export function offsetRect(rect, deltaX = 0, deltaY = 0) {
  if (!rect) {
    return null
  }

  return {
    ...rect,
    x: rect.x + deltaX,
    y: rect.y + deltaY,
  }
}

export function withRectClip(context, rect, callback) {
  if (!context || typeof callback !== 'function') {
    return
  }

  if (!rect || rect.width <= 0 || rect.height <= 0) {
    callback()
    return
  }

  context.save()
  context.beginPath()
  context.rect(rect.x, rect.y, rect.width, rect.height)
  context.clip()

  try {
    callback()
  } finally {
    context.restore()
  }
}
