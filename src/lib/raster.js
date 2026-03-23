import { measureTextLayer, renderTextLayer } from './textLayer'

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

export function canvasToBitmap(canvas) {
  return canvas.toDataURL('image/png')
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

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be loaded'))
    image.src = src
  })
}

export async function createCanvasFromSource(src) {
  const image = await loadImageElement(src)
  const canvas = createSizedCanvas(image.naturalWidth, image.naturalHeight)

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas context is unavailable')
  }

  context.drawImage(image, 0, 0)

  return {
    canvas,
    width: image.naturalWidth,
    height: image.naturalHeight,
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
  const canvas = createSizedCanvas(1, 1)
  const context = canvas.getContext('2d')

  if (!context) {
    return {
      width: layer.width ?? 0,
      height: layer.height ?? 0,
    }
  }

  context.font = `${layer.fontSize}px ${layer.fontFamily}`

  const lines = String(layer.text ?? '').split('\n')
  const lineHeight = layer.fontSize * 0.95
  const maxLineWidth = lines.reduce((largestWidth, line) => {
    const metrics = context.measureText(line || ' ')
    return Math.max(largestWidth, metrics.width)
  }, 0)

  return {
    width: Math.ceil(maxLineWidth + 8),
    height: Math.ceil((lines.length * lineHeight) + 8),
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
