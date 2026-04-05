import { createSizedCanvas } from './raster'

function traceSelectionPath(context, points, transformPoint = (point) => point) {
  if (!context || points.length === 0) {
    return
  }

  const firstPoint = transformPoint(points[0])
  context.beginPath()
  context.moveTo(firstPoint.x, firstPoint.y)

  for (let index = 1; index < points.length; index += 1) {
    const point = transformPoint(points[index])
    context.lineTo(point.x, point.y)
  }

  context.closePath()
}

export function getSelectionBounds(points) {
  if (!points || points.length < 3) {
    return null
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return {
    minX: Math.floor(minX),
    minY: Math.floor(minY),
    maxX: Math.ceil(maxX),
    maxY: Math.ceil(maxY),
    width: Math.max(1, Math.ceil(maxX) - Math.floor(minX)),
    height: Math.max(1, Math.ceil(maxY) - Math.floor(minY)),
  }
}

export function appendLassoPoint(points, point, minimumDistance = 2) {
  if (!points.length) {
    return [point]
  }

  const lastPoint = points.at(-1)
  const deltaX = point.x - lastPoint.x
  const deltaY = point.y - lastPoint.y

  if (Math.hypot(deltaX, deltaY) < minimumDistance) {
    return points
  }

  return [...points, point]
}

export function finalizeLassoSelection(points) {
  const bounds = getSelectionBounds(points)

  if (!bounds) {
    return null
  }

  return {
    points,
    isDrawing: false,
    isClosed: true,
    bounds,
  }
}

export function extractSelectionToCanvas(sourceCanvas, selection) {
  if (!sourceCanvas || !selection?.bounds || selection.points.length < 3) {
    return null
  }

  const { bounds } = selection
  const outputCanvas = createSizedCanvas(bounds.width, bounds.height)
  const context = outputCanvas.getContext('2d')

  if (!context) {
    return null
  }

  context.save()
  traceSelectionPath(context, selection.points, (point) => ({
    x: point.x - bounds.minX,
    y: point.y - bounds.minY,
  }))
  context.clip()
  context.drawImage(sourceCanvas, -bounds.minX, -bounds.minY)
  context.restore()

  return outputCanvas
}

export function clearSelectionFromCanvas(targetCanvas, selection) {
  if (!targetCanvas || !selection?.bounds || selection.points.length < 3) {
    return
  }

  const context = targetCanvas.getContext('2d')

  if (!context) {
    return
  }

  context.save()
  traceSelectionPath(context, selection.points)
  context.clip()
  context.clearRect(
    selection.bounds.minX,
    selection.bounds.minY,
    selection.bounds.width,
    selection.bounds.height,
  )
  context.restore()
}

export function createFloatingSelection(layer, sourceCanvas, selection, mode, restoreCanvas = null) {
  const extractedCanvas = extractSelectionToCanvas(sourceCanvas, selection)

  if (!layer || !sourceCanvas || !selection?.bounds || !extractedCanvas) {
    return null
  }

  const scaleX = layer.width / Math.max(sourceCanvas.width, 1)
  const scaleY = layer.height / Math.max(sourceCanvas.height, 1)

  return {
    sourceLayerId: layer.id,
    canvas: extractedCanvas,
    x: layer.x + (selection.bounds.minX * scaleX),
    y: layer.y + (selection.bounds.minY * scaleY),
    width: extractedCanvas.width * scaleX,
    height: extractedCanvas.height * scaleY,
    selectionPoints: selection.points.map((point) => ({
      x: point.x - selection.bounds.minX,
      y: point.y - selection.bounds.minY,
    })),
    mode,
    scaleX,
    scaleY,
    restoreCanvas,
  }
}

export function renderLassoSelection(context, selection) {
  if (!context || !selection?.points?.length) {
    return
  }

  context.save()
  context.setLineDash([8, 6])
  context.lineWidth = 1.5
  context.strokeStyle = '#ffffff'
  traceSelectionPath(context, selection.points)
  context.stroke()
  context.lineDashOffset = 7
  context.strokeStyle = '#0f172a'
  traceSelectionPath(context, selection.points)
  context.stroke()
  context.restore()
}

export function renderFloatingSelection(context, floatingSelection) {
  if (!context || !floatingSelection?.canvas) {
    return
  }

  context.save()
  context.globalAlpha = 0.95
  context.drawImage(
    floatingSelection.canvas,
    floatingSelection.x,
    floatingSelection.y,
    floatingSelection.width,
    floatingSelection.height,
  )
  context.setLineDash([8, 6])
  context.lineWidth = 1.5
  context.strokeStyle = '#0f172a'
  context.strokeRect(
    floatingSelection.x,
    floatingSelection.y,
    floatingSelection.width,
    floatingSelection.height,
  )
  context.restore()
}

export function isPointInsideFloatingSelection(point, floatingSelection) {
  if (!point || !floatingSelection) {
    return false
  }

  return (
    point.x >= floatingSelection.x &&
    point.x <= floatingSelection.x + floatingSelection.width &&
    point.y >= floatingSelection.y &&
    point.y <= floatingSelection.y + floatingSelection.height
  )
}

export function isPointInsidePolygon(point, polygonPoints) {
  if (!point || !polygonPoints || polygonPoints.length < 3) {
    return false
  }

  let isInside = false

  for (
    let currentIndex = 0, previousIndex = polygonPoints.length - 1;
    currentIndex < polygonPoints.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const currentPoint = polygonPoints[currentIndex]
    const previousPoint = polygonPoints[previousIndex]
    const intersects = (
      ((currentPoint.y > point.y) !== (previousPoint.y > point.y)) &&
      (point.x < (
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
        ((previousPoint.y - currentPoint.y) || Number.EPSILON)
      ) + currentPoint.x)
    )

    if (intersects) {
      isInside = !isInside
    }
  }

  return isInside
}
