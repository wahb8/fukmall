export const DEFAULT_SNAP_THRESHOLD = 8

export function createEmptySnapGuides() {
  return {
    showVerticalCenter: false,
    showHorizontalCenter: false,
    showLeftEdge: false,
    showRightEdge: false,
    showTopEdge: false,
    showBottomEdge: false,
  }
}

export function applyMoveSnapping(
  centerX,
  centerY,
  movingWidth,
  movingHeight,
  containerWidth,
  containerHeight,
  settings,
) {
  const guides = createEmptySnapGuides()
  const enabledX = settings.enabledX ?? true
  const enabledY = settings.enabledY ?? true

  if (!settings.enabled) {
    return {
      x: centerX,
      y: centerY,
      guides,
    }
  }

  const frameCenterX = containerWidth / 2
  const frameCenterY = containerHeight / 2
  const left = centerX - (movingWidth / 2)
  const top = centerY - (movingHeight / 2)
  const right = centerX + (movingWidth / 2)
  const bottom = centerY + (movingHeight / 2)

  let snappedX = centerX
  let snappedY = centerY

  if (enabledX && Math.abs(centerX - frameCenterX) <= settings.threshold) {
    snappedX = frameCenterX
    guides.showVerticalCenter = true
  } else if (enabledX && Math.abs(left) <= settings.threshold) {
    snappedX = movingWidth / 2
    guides.showLeftEdge = true
  } else if (enabledX && Math.abs(right - containerWidth) <= settings.threshold) {
    snappedX = containerWidth - (movingWidth / 2)
    guides.showRightEdge = true
  }

  if (enabledY && Math.abs(centerY - frameCenterY) <= settings.threshold) {
    snappedY = frameCenterY
    guides.showHorizontalCenter = true
  } else if (enabledY && Math.abs(top) <= settings.threshold) {
    snappedY = movingHeight / 2
    guides.showTopEdge = true
  } else if (enabledY && Math.abs(bottom - containerHeight) <= settings.threshold) {
    snappedY = containerHeight - (movingHeight / 2)
    guides.showBottomEdge = true
  }

  return {
    x: snappedX,
    y: snappedY,
    guides,
  }
}
