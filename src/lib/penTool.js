function applyBrushStyle(ctx, color, size, compositeOperation = 'source-over') {
  ctx.save()
  ctx.globalCompositeOperation = compositeOperation
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = size
  ctx.strokeStyle = color
  ctx.fillStyle = color
}

function getDistance(fromPoint, toPoint) {
  return Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y)
}

function getMidpoint(fromPoint, toPoint) {
  return {
    x: (fromPoint.x + toPoint.x) / 2,
    y: (fromPoint.y + toPoint.y) / 2,
  }
}

function lerpPoint(fromPoint, toPoint, amount) {
  return {
    x: fromPoint.x + ((toPoint.x - fromPoint.x) * amount),
    y: fromPoint.y + ((toPoint.y - fromPoint.y) * amount),
  }
}

function applyLowPassSmoothing(points, factor) {
  if (points.length <= 2) {
    return points
  }

  const smoothedPoints = [points[0]]
  let previousPoint = points[0]

  for (let index = 1; index < points.length - 1; index += 1) {
    const currentPoint = points[index]
    const nextPoint = {
      x: previousPoint.x + ((currentPoint.x - previousPoint.x) * factor),
      y: previousPoint.y + ((currentPoint.y - previousPoint.y) * factor),
    }

    smoothedPoints.push(nextPoint)
    previousPoint = nextPoint
  }

  smoothedPoints.push(points.at(-1))
  return smoothedPoints
}

function applyChaikinSmoothing(points, iterations) {
  let nextPoints = points

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (nextPoints.length <= 2) {
      return nextPoints
    }

    const refinedPoints = [nextPoints[0]]

    for (let index = 0; index < nextPoints.length - 1; index += 1) {
      const currentPoint = nextPoints[index]
      const followingPoint = nextPoints[index + 1]
      refinedPoints.push(lerpPoint(currentPoint, followingPoint, 0.25))
      refinedPoints.push(lerpPoint(currentPoint, followingPoint, 0.75))
    }

    refinedPoints.push(nextPoints.at(-1))
    nextPoints = refinedPoints
  }

  return nextPoints
}

export function drawStroke(ctx, fromX, fromY, toX, toY, color, size, compositeOperation = 'source-over') {
  applyBrushStyle(ctx, color, size, compositeOperation)
  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
  ctx.stroke()
  ctx.restore()
}

export function drawDot(ctx, x, y, color, size, compositeOperation = 'source-over') {
  applyBrushStyle(ctx, color, size, compositeOperation)
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function getStrokeMinimumDistance(size) {
  return Math.max(1.25, Math.min(size * 0.24, 4))
}

export function getStrokeDragThreshold(size) {
  return Math.max(2, Math.min(size * 0.35, 6))
}

export function appendStrokePoint(points, point, minimumDistance) {
  if (!points.length) {
    return [point]
  }

  const lastPoint = points.at(-1)

  if (getDistance(lastPoint, point) < minimumDistance) {
    return points
  }

  return [...points, point]
}

export function hasStrokeMovedBeyondThreshold(points, threshold) {
  if (points.length < 2) {
    return false
  }

  const firstPoint = points[0]
  const lastPoint = points.at(-1)

  return getDistance(firstPoint, lastPoint) >= threshold
}

export function getSmoothedStrokePoints(points, size) {
  if (points.length <= 2) {
    return points
  }

  const lowPassFactor = Math.max(0.32, Math.min(0.5, 0.42 + (size / 64) * 0.08))
  const chaikinIterations = points.length > 4 ? 2 : 1
  const filteredPoints = applyLowPassSmoothing(points, lowPassFactor)

  return applyChaikinSmoothing(filteredPoints, chaikinIterations)
}

export function drawSmoothStroke(ctx, points, color, size, compositeOperation = 'source-over') {
  if (!ctx || points.length < 2) {
    return
  }

  applyBrushStyle(ctx, color, size, compositeOperation)
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y)
    ctx.stroke()
    ctx.restore()
    return
  }

  for (let index = 1; index < points.length - 2; index += 1) {
    const midpoint = getMidpoint(points[index], points[index + 1])
    ctx.quadraticCurveTo(points[index].x, points[index].y, midpoint.x, midpoint.y)
  }

  const penultimatePoint = points[points.length - 2]
  const lastPoint = points[points.length - 1]
  ctx.quadraticCurveTo(
    penultimatePoint.x,
    penultimatePoint.y,
    lastPoint.x,
    lastPoint.y,
  )
  ctx.stroke()
  ctx.restore()
}
