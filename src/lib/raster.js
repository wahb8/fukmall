import { measureTextLayer, renderTextLayer } from './textLayer'

function parseNumericSvgDimension(value) {
  if (typeof value !== 'string') {
    return null
  }

  const match = value.trim().match(/^([+-]?\d*\.?\d+)/)

  if (!match) {
    return null
  }

  const numericValue = Number(match[1])
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null
}

function decodeDataUrlText(dataUrl) {
  const commaIndex = dataUrl.indexOf(',')

  if (commaIndex === -1) {
    return null
  }

  const metadata = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)

  try {
    if (/;base64/i.test(metadata)) {
      return atob(payload)
    }

    return decodeURIComponent(payload)
  } catch {
    return null
  }
}

function extractSvgMarkup(source) {
  if (typeof source !== 'string' || source.length === 0) {
    return null
  }

  if (source.trimStart().startsWith('<svg')) {
    return source
  }

  if (/^data:image\/svg\+xml/i.test(source)) {
    return decodeDataUrlText(source)
  }

  return null
}

function parseSvgPreserveAspectRatio(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      align: 'xMidYMid',
      mode: 'meet',
    }
  }

  const normalizedValue = value.trim()

  if (normalizedValue === 'none') {
    return {
      align: 'none',
      mode: 'none',
    }
  }

  const [alignToken = 'xMidYMid', modeToken = 'meet'] = normalizedValue.split(/\s+/)
  const normalizedAlign = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.test(alignToken)
    ? alignToken
    : 'xMidYMid'
  const normalizedMode = modeToken === 'slice' ? 'slice' : 'meet'

  return {
    align: normalizedAlign,
    mode: normalizedMode,
  }
}

export function inferImageSourceKindFromSrc(src) {
  if (typeof src !== 'string') {
    return 'bitmap'
  }

  const normalizedSource = src.trim()

  if (
    /^data:image\/svg\+xml/i.test(normalizedSource) ||
    normalizedSource.startsWith('<svg') ||
    /\.svg(?:[?#].*)?$/i.test(normalizedSource)
  ) {
    return 'svg'
  }

  return 'bitmap'
}

export function getSvgIntrinsicDimensionsFromSource(src) {
  const svgMarkup = extractSvgMarkup(src)

  if (!svgMarkup || typeof DOMParser === 'undefined') {
    return null
  }

  try {
    const document = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml')
    const svgElement = document.documentElement

    if (!svgElement || svgElement.nodeName.toLowerCase() !== 'svg') {
      return null
    }

    const width = parseNumericSvgDimension(svgElement.getAttribute('width'))
    const height = parseNumericSvgDimension(svgElement.getAttribute('height'))
    const viewBox = svgElement.getAttribute('viewBox')
    const viewBoxValues = viewBox
      ? viewBox.trim().split(/[\s,]+/).map((value) => Number(value))
      : []
    const hasViewBox = viewBoxValues.length === 4
    const viewBoxWidth = hasViewBox ? viewBoxValues[2] : null
    const viewBoxHeight = hasViewBox ? viewBoxValues[3] : null

    if (width && height) {
      return { width, height }
    }

    if (
      Number.isFinite(viewBoxWidth) &&
      Number.isFinite(viewBoxHeight) &&
      viewBoxWidth > 0 &&
      viewBoxHeight > 0
    ) {
      if (width && !height) {
        return {
          width,
          height: width * (viewBoxHeight / viewBoxWidth),
        }
      }

      if (height && !width) {
        return {
          width: height * (viewBoxWidth / viewBoxHeight),
          height,
        }
      }

      return {
        width: viewBoxWidth,
        height: viewBoxHeight,
      }
    }
  } catch {
    return null
  }

  return null
}

export function getSvgDrawRectForBox(src, boxWidth, boxHeight) {
  const intrinsicDimensions = getSvgIntrinsicDimensionsFromSource(src)
  const svgMarkup = extractSvgMarkup(src)

  if (!intrinsicDimensions || !svgMarkup) {
    return {
      x: 0,
      y: 0,
      width: boxWidth,
      height: boxHeight,
    }
  }

  let preserveAspectRatio = {
    align: 'xMidYMid',
    mode: 'meet',
  }
  let hasViewBox = false

  if (typeof DOMParser !== 'undefined') {
    try {
      const document = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml')
      const svgElement = document.documentElement

      if (svgElement?.nodeName?.toLowerCase() === 'svg') {
        hasViewBox = Boolean(svgElement.getAttribute('viewBox'))
        preserveAspectRatio = parseSvgPreserveAspectRatio(
          svgElement.getAttribute('preserveAspectRatio'),
        )
      }
    } catch {
      // Fall back to the default SVG viewport behavior.
    }
  }

  if (!hasViewBox) {
    return {
      x: 0,
      y: 0,
      width: boxWidth,
      height: boxHeight,
    }
  }

  if (preserveAspectRatio.mode === 'none' || preserveAspectRatio.align === 'none') {
    return {
      x: 0,
      y: 0,
      width: boxWidth,
      height: boxHeight,
    }
  }

  const intrinsicRatio = intrinsicDimensions.width / Math.max(intrinsicDimensions.height, 1)
  const boxRatio = boxWidth / Math.max(boxHeight, 1)
  const shouldLimitByWidth = preserveAspectRatio.mode === 'slice'
    ? boxRatio < intrinsicRatio
    : boxRatio > intrinsicRatio
  const drawWidth = shouldLimitByWidth
    ? boxWidth
    : boxHeight * intrinsicRatio
  const drawHeight = shouldLimitByWidth
    ? boxWidth / Math.max(intrinsicRatio, Number.EPSILON)
    : boxHeight
  const remainingX = boxWidth - drawWidth
  const remainingY = boxHeight - drawHeight
  const align = preserveAspectRatio.align
  const alignX = align.startsWith('xMin') ? 0 : align.startsWith('xMax') ? 1 : 0.5
  const alignY = align.endsWith('YMin') ? 0 : align.endsWith('YMax') ? 1 : 0.5

  return {
    x: remainingX * alignX,
    y: remainingY * alignY,
    width: drawWidth,
    height: drawHeight,
  }
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export async function createCanvasFromRenderedSvgBox(src, width, height) {
  const resolvedWidth = Math.max(1, Math.round(width))
  const resolvedHeight = Math.max(1, Math.round(height))
  const wrappedSvgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${resolvedWidth}" height="${resolvedHeight}" viewBox="0 0 ${resolvedWidth} ${resolvedHeight}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${resolvedWidth}px;height:${resolvedHeight}px;overflow:hidden;">
          <img
            src="${escapeHtmlAttribute(src)}"
            style="display:block;width:100%;height:100%;margin:0;padding:0;border:0;"
          />
        </div>
      </foreignObject>
    </svg>
  `.trim()
  const wrappedSvgSource = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(wrappedSvgMarkup)}`

  try {
    return await createCanvasFromSource(wrappedSvgSource, resolvedWidth, resolvedHeight)
  } catch {
    return createCanvasFromSource(src, resolvedWidth, resolvedHeight)
  }
}

export function createCanvasElement() {
  return document.createElement('canvas')
}

export function createSizedCanvas(width, height) {
  const canvas = createCanvasElement()
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

export function createTransparentCanvas(width, height) {
  return createSizedCanvas(width, height)
}

function transformLayerLocalVectorToDocument(layer, x, y) {
  const angle = ((layer?.rotation ?? 0) * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const scaledX = x * (layer?.scaleX ?? 1)
  const scaledY = y * (layer?.scaleY ?? 1)

  return {
    x: (scaledX * cosine) - (scaledY * sine),
    y: (scaledX * sine) + (scaledY * cosine),
  }
}

export function expandBitmapSurfaceToFitBounds(
  layer,
  sourceCanvas,
  coverageBounds,
  options = {},
) {
  if (!layer || !sourceCanvas || !coverageBounds) {
    return null
  }

  const padding = Math.max(0, Number(options.padding) || 0)
  const minX = Math.min(Number(coverageBounds.minX), Number(coverageBounds.maxX))
  const minY = Math.min(Number(coverageBounds.minY), Number(coverageBounds.maxY))
  const maxX = Math.max(Number(coverageBounds.minX), Number(coverageBounds.maxX))
  const maxY = Math.max(Number(coverageBounds.minY), Number(coverageBounds.maxY))

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null
  }

  const expandLeft = Math.max(0, Math.ceil(padding - minX))
  const expandTop = Math.max(0, Math.ceil(padding - minY))
  const expandRight = Math.max(0, Math.ceil(maxX + padding - sourceCanvas.width))
  const expandBottom = Math.max(0, Math.ceil(maxY + padding - sourceCanvas.height))

  if (expandLeft === 0 && expandTop === 0 && expandRight === 0 && expandBottom === 0) {
    return null
  }

  const nextWidth = sourceCanvas.width + expandLeft + expandRight
  const nextHeight = sourceCanvas.height + expandTop + expandBottom
  const nextCanvas = createTransparentCanvas(nextWidth, nextHeight)
  const context = nextCanvas.getContext('2d')

  if (!context) {
    return null
  }

  context.drawImage(sourceCanvas, expandLeft, expandTop)

  const surfaceScaleX = (layer.width ?? sourceCanvas.width) / Math.max(sourceCanvas.width, 1)
  const surfaceScaleY = (layer.height ?? sourceCanvas.height) / Math.max(sourceCanvas.height, 1)
  const expandLeftLocal = expandLeft * surfaceScaleX
  const expandTopLocal = expandTop * surfaceScaleY
  const expandRightLocal = expandRight * surfaceScaleX
  const expandBottomLocal = expandBottom * surfaceScaleY
  const nextLayerWidth = (layer.width ?? sourceCanvas.width) + expandLeftLocal + expandRightLocal
  const nextLayerHeight = (layer.height ?? sourceCanvas.height) + expandTopLocal + expandBottomLocal
  const centerDelta = transformLayerLocalVectorToDocument(
    layer,
    (expandRightLocal - expandLeftLocal) / 2,
    (expandBottomLocal - expandTopLocal) / 2,
  )
  const currentCenterX = layer.x ?? 0
  const currentCenterY = layer.y ?? 0
  const nextCenterX = currentCenterX + centerDelta.x
  const nextCenterY = currentCenterY + centerDelta.y
  const nextLayer = {
    ...layer,
    x: nextCenterX,
    y: nextCenterY,
    width: nextLayerWidth,
    height: nextLayerHeight,
  }

  return {
    canvas: nextCanvas,
    contentOffsetX: expandLeft,
    contentOffsetY: expandTop,
    width: nextCanvas.width,
    height: nextCanvas.height,
    layerShiftX: nextLayer.x - (layer.x ?? 0),
    layerShiftY: nextLayer.y - (layer.y ?? 0),
    expandLeft,
    expandTop,
    expandRight,
    expandBottom,
    layer: nextLayer,
  }
}

export function cloneCanvas(sourceCanvas) {
  const canvas = createCanvasElement()
  canvas.width = sourceCanvas.width
  canvas.height = sourceCanvas.height
  const context = canvas.getContext('2d')

  if (context) {
    context.drawImage(sourceCanvas, 0, 0)
  }

  return canvas
}

export function getCanvasAlphaBounds(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    return null
  }

  const { width, height } = canvas
  const { data } = context.getImageData(0, 0, width, height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alphaIndex = ((y * width) + x) * 4 + 3

      if (data[alphaIndex] === 0) {
        continue
      }

      if (x < minX) {
        minX = x
      }

      if (y < minY) {
        minY = y
      }

      if (x > maxX) {
        maxX = x
      }

      if (y > maxY) {
        maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

export function findVisibleAlphaBounds(
  imageData,
  width,
  height,
  {
    alphaThreshold = 8,
    padding = 1,
  } = {},
) {
  const data = imageData?.data ?? imageData
  const resolvedWidth = Math.max(1, Math.round(Number(width) || 0))
  const resolvedHeight = Math.max(1, Math.round(Number(height) || 0))
  const resolvedThreshold = Math.max(0, Math.min(255, Math.round(Number(alphaThreshold) || 0)))
  const resolvedPadding = Math.max(0, Math.round(Number(padding) || 0))

  if (!data || data.length < resolvedWidth * resolvedHeight * 4) {
    return null
  }

  let minX = resolvedWidth
  let minY = resolvedHeight
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < resolvedHeight; y += 1) {
    for (let x = 0; x < resolvedWidth; x += 1) {
      const alphaIndex = ((y * resolvedWidth) + x) * 4 + 3

      if (data[alphaIndex] <= resolvedThreshold) {
        continue
      }

      if (x < minX) {
        minX = x
      }

      if (y < minY) {
        minY = y
      }

      if (x > maxX) {
        maxX = x
      }

      if (y > maxY) {
        maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null
  }

  const paddedMinX = Math.max(0, minX - resolvedPadding)
  const paddedMinY = Math.max(0, minY - resolvedPadding)
  const paddedMaxX = Math.min(resolvedWidth - 1, maxX + resolvedPadding)
  const paddedMaxY = Math.min(resolvedHeight - 1, maxY + resolvedPadding)

  return {
    x: paddedMinX,
    y: paddedMinY,
    width: paddedMaxX - paddedMinX + 1,
    height: paddedMaxY - paddedMinY + 1,
  }
}

export function cropCanvasToBounds(sourceCanvas, bounds) {
  if (!bounds) {
    return createTransparentCanvas(1, 1)
  }

  const canvas = createSizedCanvas(bounds.width, bounds.height)
  const context = canvas.getContext('2d')

  if (context) {
    context.drawImage(
      sourceCanvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height,
    )
  }

  return canvas
}

export function trimCanvasTransparentBounds(
  canvas,
  {
    alphaThreshold = 8,
    padding = 1,
  } = {},
) {
  const context = canvas?.getContext?.('2d', { willReadFrequently: true })

  if (!canvas || !context) {
    return {
      canvas,
      width: canvas?.width ?? 0,
      height: canvas?.height ?? 0,
      offsetX: 0,
      offsetY: 0,
      didTrim: false,
      isEmpty: false,
    }
  }

  const bounds = findVisibleAlphaBounds(
    context.getImageData(0, 0, canvas.width, canvas.height),
    canvas.width,
    canvas.height,
    {
      alphaThreshold,
      padding,
    },
  )

  if (!bounds) {
    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      offsetX: 0,
      offsetY: 0,
      didTrim: false,
      isEmpty: true,
    }
  }

  if (
    bounds.x === 0 &&
    bounds.y === 0 &&
    bounds.width === canvas.width &&
    bounds.height === canvas.height
  ) {
    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      offsetX: 0,
      offsetY: 0,
      didTrim: false,
      isEmpty: false,
    }
  }

  const trimmedCanvas = cropCanvasToBounds(canvas, bounds)

  return {
    canvas: trimmedCanvas,
    width: trimmedCanvas.width,
    height: trimmedCanvas.height,
    offsetX: bounds.x,
    offsetY: bounds.y,
    didTrim: true,
    isEmpty: false,
  }
}

export function canvasToBitmap(canvas) {
  return canvas.toDataURL('image/png')
}

export async function trimImageSourceTransparentBounds(
  src,
  {
    alphaThreshold = 8,
    padding = 1,
  } = {},
) {
  const { canvas, width, height } = await createCanvasFromSource(src)
  const trimmedResult = trimCanvasTransparentBounds(canvas, {
    alphaThreshold,
    padding,
  })

  if (!trimmedResult.didTrim || trimmedResult.isEmpty) {
    return {
      src,
      width,
      height,
      offsetX: 0,
      offsetY: 0,
      didTrim: false,
      isEmpty: Boolean(trimmedResult.isEmpty),
    }
  }

  return {
    src: canvasToBitmap(trimmedResult.canvas),
    width: trimmedResult.width,
    height: trimmedResult.height,
    offsetX: trimmedResult.offsetX,
    offsetY: trimmedResult.offsetY,
    didTrim: true,
    isEmpty: false,
  }
}

export function paintCanvas(targetCanvas, sourceCanvas) {
  if (!targetCanvas || !sourceCanvas) {
    return
  }

  if (targetCanvas.width !== sourceCanvas.width) {
    targetCanvas.width = sourceCanvas.width
  }

  if (targetCanvas.height !== sourceCanvas.height) {
    targetCanvas.height = sourceCanvas.height
  }

  const context = targetCanvas.getContext('2d')

  if (!context) {
    return
  }

  context.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
  context.drawImage(sourceCanvas, 0, 0)
}

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function parseHexColor(color) {
  if (typeof color !== 'string') {
    return null
  }

  const normalizedColor = color.trim()

  if (!normalizedColor.startsWith('#')) {
    return null
  }

  const hexValue = normalizedColor.slice(1)
  const expandedHex = hexValue.length === 3
    ? hexValue
      .split('')
      .map((character) => character.repeat(2))
      .join('')
    : hexValue

  if (!/^[\da-f]{6}$/i.test(expandedHex)) {
    return null
  }

  return {
    r: Number.parseInt(expandedHex.slice(0, 2), 16),
    g: Number.parseInt(expandedHex.slice(2, 4), 16),
    b: Number.parseInt(expandedHex.slice(4, 6), 16),
    a: 255,
  }
}

function lerpChannel(fromValue, toValue, amount) {
  return Math.round(fromValue + ((toValue - fromValue) * amount))
}

function isColorWithinTolerance(data, pixelIndex, seedColor, tolerance) {
  return (
    Math.abs(data[pixelIndex] - seedColor.r) <= tolerance &&
    Math.abs(data[pixelIndex + 1] - seedColor.g) <= tolerance &&
    Math.abs(data[pixelIndex + 2] - seedColor.b) <= tolerance &&
    Math.abs(data[pixelIndex + 3] - seedColor.a) <= tolerance
  )
}

export function floodFillCanvas(
  canvas,
  startX,
  startY,
  fillColor,
  tolerance = 0,
  options = {},
) {
  const context = canvas?.getContext('2d', { willReadFrequently: true })
  const reachedBoundary = {
    left: false,
    top: false,
    right: false,
    bottom: false,
  }

  if (!context) {
    return { changed: false, changedPixelCount: 0, reachedBoundary }
  }

  const targetColor = parseHexColor(fillColor)

  if (!targetColor) {
    return { changed: false, changedPixelCount: 0, reachedBoundary }
  }

  const seedX = Math.floor(startX)
  const seedY = Math.floor(startY)

  if (
    seedX < 0 ||
    seedY < 0 ||
    seedX >= canvas.width ||
    seedY >= canvas.height
  ) {
    return { changed: false, changedPixelCount: 0, reachedBoundary }
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  const seedIndex = ((seedY * canvas.width) + seedX) * 4
  const seedColor = {
    r: data[seedIndex],
    g: data[seedIndex + 1],
    b: data[seedIndex + 2],
    a: data[seedIndex + 3],
  }
  const preserveAlpha = Boolean(options.preserveAlpha)
  const restrictToVisiblePixels = Boolean(options.restrictToVisiblePixels)

  if (restrictToVisiblePixels && seedColor.a === 0) {
    return { changed: false, changedPixelCount: 0, reachedBoundary }
  }

  const normalizedTolerance = clampColorChannel(tolerance)
  const visited = new Uint8Array(canvas.width * canvas.height)
  const stack = [[seedX, seedY]]
  let changedPixelCount = 0

  while (stack.length > 0) {
    const nextPoint = stack.pop()

    if (!nextPoint) {
      continue
    }

    const [x, y] = nextPoint
    const visitedIndex = (y * canvas.width) + x

    if (visited[visitedIndex]) {
      continue
    }

    visited[visitedIndex] = 1

    const pixelIndex = visitedIndex * 4
    const currentAlpha = data[pixelIndex + 3]

    if (restrictToVisiblePixels && currentAlpha === 0) {
      continue
    }

    if (!isColorWithinTolerance(data, pixelIndex, seedColor, normalizedTolerance)) {
      continue
    }

    if (x === 0) {
      reachedBoundary.left = true
    }

    if (y === 0) {
      reachedBoundary.top = true
    }

    if (x === canvas.width - 1) {
      reachedBoundary.right = true
    }

    if (y === canvas.height - 1) {
      reachedBoundary.bottom = true
    }

    const nextAlpha = preserveAlpha ? currentAlpha : targetColor.a

    if (
      data[pixelIndex] !== targetColor.r ||
      data[pixelIndex + 1] !== targetColor.g ||
      data[pixelIndex + 2] !== targetColor.b ||
      data[pixelIndex + 3] !== nextAlpha
    ) {
      data[pixelIndex] = targetColor.r
      data[pixelIndex + 1] = targetColor.g
      data[pixelIndex + 2] = targetColor.b
      data[pixelIndex + 3] = nextAlpha
      changedPixelCount += 1
    }

    if (x > 0) {
      stack.push([x - 1, y])
    }

    if (x < canvas.width - 1) {
      stack.push([x + 1, y])
    }

    if (y > 0) {
      stack.push([x, y - 1])
    }

    if (y < canvas.height - 1) {
      stack.push([x, y + 1])
    }
  }

  if (changedPixelCount === 0) {
    return { changed: false, changedPixelCount: 0, reachedBoundary }
  }

  context.putImageData(imageData, 0, 0)

  return {
    changed: true,
    changedPixelCount,
    reachedBoundary,
  }
}

export function applyLinearGradientToCanvas(
  canvas,
  startPoint,
  endPoint,
  startColor,
  endColor,
  options = {},
) {
  const context = canvas?.getContext('2d', { willReadFrequently: true })

  if (!context) {
    return { changed: false, changedPixelCount: 0 }
  }

  const resolvedStartColor = parseHexColor(startColor)
  const resolvedEndColor = typeof endColor === 'string'
    ? parseHexColor(endColor)
    : endColor

  if (!resolvedStartColor || !resolvedEndColor) {
    return { changed: false, changedPixelCount: 0 }
  }

  const startX = Number(startPoint?.x)
  const startY = Number(startPoint?.y)
  const endX = Number(endPoint?.x)
  const endY = Number(endPoint?.y)

  if (
    !Number.isFinite(startX) ||
    !Number.isFinite(startY) ||
    !Number.isFinite(endX) ||
    !Number.isFinite(endY)
  ) {
    return { changed: false, changedPixelCount: 0 }
  }

  const deltaX = endX - startX
  const deltaY = endY - startY
  const vectorLengthSquared = (deltaX * deltaX) + (deltaY * deltaY)

  if (vectorLengthSquared <= 0.0001) {
    return { changed: false, changedPixelCount: 0 }
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  const restrictToVisiblePixels = Boolean(options.restrictToVisiblePixels)
  const preserveAlphaMask = Boolean(options.preserveAlphaMask)
  let changedPixelCount = 0

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const pixelIndex = ((y * canvas.width) + x) * 4
      const currentAlpha = data[pixelIndex + 3]

      if (restrictToVisiblePixels && currentAlpha === 0) {
        continue
      }

      const relativeX = (x + 0.5) - startX
      const relativeY = (y + 0.5) - startY
      const projection = ((relativeX * deltaX) + (relativeY * deltaY)) / vectorLengthSquared
      const amount = Math.max(0, Math.min(1, projection))
      const interpolatedAlpha = lerpChannel(resolvedStartColor.a, resolvedEndColor.a, amount)
      const nextAlpha = preserveAlphaMask
        ? Math.round((interpolatedAlpha * currentAlpha) / 255)
        : interpolatedAlpha
      const nextRed = lerpChannel(resolvedStartColor.r, resolvedEndColor.r, amount)
      const nextGreen = lerpChannel(resolvedStartColor.g, resolvedEndColor.g, amount)
      const nextBlue = lerpChannel(resolvedStartColor.b, resolvedEndColor.b, amount)

      if (
        data[pixelIndex] !== nextRed ||
        data[pixelIndex + 1] !== nextGreen ||
        data[pixelIndex + 2] !== nextBlue ||
        data[pixelIndex + 3] !== nextAlpha
      ) {
        data[pixelIndex] = nextRed
        data[pixelIndex + 1] = nextGreen
        data[pixelIndex + 2] = nextBlue
        data[pixelIndex + 3] = nextAlpha
        changedPixelCount += 1
      }
    }
  }

  if (changedPixelCount === 0) {
    return { changed: false, changedPixelCount: 0 }
  }

  context.putImageData(imageData, 0, 0)

  return {
    changed: true,
    changedPixelCount,
  }
}

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const normalizedSource = String(src ?? '').trim()

    if (/^https?:\/\//i.test(normalizedSource)) {
      image.crossOrigin = 'anonymous'
    }

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be loaded'))
    image.src = normalizedSource
  })
}

export async function loadImageDimensionsFromSource(src) {
  const svgDimensions = getSvgIntrinsicDimensionsFromSource(src)

  if (svgDimensions) {
    return svgDimensions
  }

  const image = await loadImageElement(src)

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
  }
}

export async function createCanvasFromSource(src, targetWidth = null, targetHeight = null) {
  const image = await loadImageElement(src)
  const resolvedWidth = targetWidth ?? image.naturalWidth
  const resolvedHeight = targetHeight ?? image.naturalHeight
  const canvas = createSizedCanvas(resolvedWidth, resolvedHeight)

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas context is unavailable')
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
  }
}

export function createEmptyMaskCanvas(width, height) {
  return createSizedCanvas(width, height)
}

export async function createMaskCanvasFromSource(src, width, height) {
  if (!src) {
    return createEmptyMaskCanvas(width, height)
  }

  const { canvas } = await createCanvasFromSource(src)

  if (canvas.width === width && canvas.height === height) {
    return canvas
  }

  const normalizedCanvas = createSizedCanvas(width, height)
  const context = normalizedCanvas.getContext('2d')

  if (context) {
    context.drawImage(canvas, 0, 0, width, height)
  }

  return normalizedCanvas
}

export function renderTextLayerToCanvas(layer) {
  const measurement = measureTextLayer(layer)
  const canvas = createSizedCanvas(
    layer.mode === 'box' ? layer.width : measurement.width,
    layer.mode === 'box' ? layer.height : measurement.height,
  )
  const context = canvas.getContext('2d')

  if (!context) {
    return canvas
  }

  renderTextLayer(context, {
    ...layer,
    width: canvas.width,
    height: canvas.height,
  })

  return canvas
}

export function measureTextLayerBounds(layer) {
  const measurement = measureTextLayer(layer)

  return {
    width: measurement.width,
    height: measurement.height,
  }
}

export function applyEraseMask(baseCanvas, maskCanvas) {
  const outputCanvas = cloneCanvas(baseCanvas)
  const context = outputCanvas.getContext('2d')

  if (context && maskCanvas) {
    context.save()
    context.globalCompositeOperation = 'destination-out'
    context.drawImage(maskCanvas, 0, 0)
    context.restore()
  }

  return outputCanvas
}

export function composeCanvasLayers(baseCanvas, overlayCanvas) {
  const outputCanvas = cloneCanvas(baseCanvas)

  if (!overlayCanvas) {
    return outputCanvas
  }

  const context = outputCanvas.getContext('2d')

  if (context) {
    context.drawImage(overlayCanvas, 0, 0)
  }

  return outputCanvas
}

export function createMaskedCanvas(sourceCanvas, maskCanvas) {
  const outputCanvas = cloneCanvas(sourceCanvas)
  const context = outputCanvas.getContext('2d')

  if (context && maskCanvas) {
    context.save()
    context.globalCompositeOperation = 'destination-in'
    context.drawImage(maskCanvas, 0, 0)
    context.restore()
  }

  return outputCanvas
}

export function composeTextLayerCanvases(layer, eraseMaskCanvas = null, paintOverlayCanvas = null) {
  const baseTextCanvas = renderTextLayerToCanvas(layer)
  const visibleTextCanvas = applyEraseMask(baseTextCanvas, eraseMaskCanvas)
  const composedCanvas = composeCanvasLayers(visibleTextCanvas, paintOverlayCanvas)

  return {
    baseTextCanvas,
    visibleTextCanvas,
    composedCanvas,
  }
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('File could not be read'))
    reader.readAsDataURL(file)
  })
}

export function toLayerCoordinates(pointerEvent, layerElement, rasterCanvas) {
  if (!layerElement || !rasterCanvas) {
    return null
  }

  const rect = layerElement.getBoundingClientRect()

  if (rect.width === 0 || rect.height === 0) {
    return null
  }

  const normalizedX = (pointerEvent.clientX - rect.left) / rect.width
  const normalizedY = (pointerEvent.clientY - rect.top) / rect.height

  return {
    x: Math.min(Math.max(normalizedX, 0), 1) * rasterCanvas.width,
    y: Math.min(Math.max(normalizedY, 0), 1) * rasterCanvas.height,
  }
}

export function getCanvasAlphaAtPoint(canvas, point) {
  if (!canvas || !point) {
    return null
  }

  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    return null
  }

  const normalizedX = Math.floor(point.x)
  const normalizedY = Math.floor(point.y)

  if (
    normalizedX < 0 ||
    normalizedY < 0 ||
    normalizedX >= canvas.width ||
    normalizedY >= canvas.height
  ) {
    return 0
  }

  return context.getImageData(normalizedX, normalizedY, 1, 1).data[3]
}

export function hasVisibleCanvasPixelNearby(
  canvas,
  point,
  padding = 4,
  alphaThreshold = 8,
) {
  if (!canvas || !point) {
    return null
  }

  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    return null
  }

  const centerX = Math.round(point.x)
  const centerY = Math.round(point.y)

  if (
    centerX + padding < 0 ||
    centerY + padding < 0 ||
    centerX - padding >= canvas.width ||
    centerY - padding >= canvas.height
  ) {
    return false
  }

  const minimumX = Math.max(0, centerX - padding)
  const maximumX = Math.min(canvas.width - 1, centerX + padding)
  const minimumY = Math.max(0, centerY - padding)
  const maximumY = Math.min(canvas.height - 1, centerY + padding)
  const sampleWidth = maximumX - minimumX + 1
  const sampleHeight = maximumY - minimumY + 1

  if (sampleWidth <= 0 || sampleHeight <= 0) {
    return false
  }

  const alphaData = context.getImageData(minimumX, minimumY, sampleWidth, sampleHeight).data

  for (let index = 3; index < alphaData.length; index += 4) {
    if (alphaData[index] > alphaThreshold) {
      return true
    }
  }

  return false
}
