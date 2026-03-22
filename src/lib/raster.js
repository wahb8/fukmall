export function createCanvasElement() {
  return document.createElement('canvas')
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
  const canvas = createCanvasElement()
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

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
