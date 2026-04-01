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
  nextX,
  nextY,
  layerWidth,
  layerHeight,
  frameWidth,
  frameHeight,
  settings,
) {
  const guides = createEmptySnapGuides()
  const enabledX = settings.enabledX ?? true
  const enabledY = settings.enabledY ?? true

  if (!settings.enabled) {
    return {
      x: nextX,
      y: nextY,
      guides,
    }
  }

  const frameCenterX = frameWidth / 2
  const frameCenterY = frameHeight / 2
  const layerCenterX = nextX + (layerWidth / 2)
  const layerCenterY = nextY + (layerHeight / 2)
  const layerRight = nextX + layerWidth
  const layerBottom = nextY + layerHeight

  let snappedX = nextX
  let snappedY = nextY

  if (enabledX && Math.abs(layerCenterX - frameCenterX) <= settings.threshold) {
    snappedX = frameCenterX - (layerWidth / 2)
    guides.showVerticalCenter = true
  } else if (enabledX && Math.abs(nextX) <= settings.threshold) {
    snappedX = 0
    guides.showLeftEdge = true
  } else if (enabledX && Math.abs(layerRight - frameWidth) <= settings.threshold) {
    snappedX = frameWidth - layerWidth
    guides.showRightEdge = true
  }

  if (enabledY && Math.abs(layerCenterY - frameCenterY) <= settings.threshold) {
    snappedY = frameCenterY - (layerHeight / 2)
    guides.showHorizontalCenter = true
  } else if (enabledY && Math.abs(nextY) <= settings.threshold) {
    snappedY = 0
    guides.showTopEdge = true
  } else if (enabledY && Math.abs(layerBottom - frameHeight) <= settings.threshold) {
    snappedY = frameHeight - layerHeight
    guides.showBottomEdge = true
  }

  return {
    x: snappedX,
    y: snappedY,
    guides,
  }
}
