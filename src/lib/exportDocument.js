import { clampLayerCornerRadius } from './layers'
import {
  composeTextLayerCanvases,
  createCanvasFromRenderedSvgBox,
  createMaskCanvasFromSource,
  createSizedCanvas,
  loadImageElement,
} from './raster'
import { loadTextLayerFont } from './textLayer'

function drawRoundedRect(context, width, height, radius) {
  const nextRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.moveTo(nextRadius, 0)
  context.lineTo(width - nextRadius, 0)
  context.quadraticCurveTo(width, 0, width, nextRadius)
  context.lineTo(width, height - nextRadius)
  context.quadraticCurveTo(width, height, width - nextRadius, height)
  context.lineTo(nextRadius, height)
  context.quadraticCurveTo(0, height, 0, height - nextRadius)
  context.lineTo(0, nextRadius)
  context.quadraticCurveTo(0, 0, nextRadius, 0)
  context.closePath()
}

async function drawLayerToContext(context, layer) {
  if (!context || !layer?.visible || layer.opacity <= 0) {
    return
  }

  context.save()
  context.globalAlpha = layer.opacity
  context.translate(layer.x + (layer.width / 2), layer.y + (layer.height / 2))
  context.rotate((layer.rotation * Math.PI) / 180)
  context.scale(layer.scaleX, layer.scaleY)
  context.translate(-(layer.width / 2), -(layer.height / 2))

  if (layer.type === 'shape') {
    context.fillStyle = layer.fill
    drawRoundedRect(context, layer.width, layer.height, layer.radius)
    context.fill()
    context.restore()
    return
  }

  if (layer.type === 'text') {
    await loadTextLayerFont(layer)
    const maskCanvas = await createMaskCanvasFromSource(
      layer.eraseMask ?? '',
      layer.width,
      layer.height,
    )
    const paintOverlayCanvas = await createMaskCanvasFromSource(
      layer.paintOverlayBitmap ?? '',
      layer.width,
      layer.height,
    )
    const composedCanvas = composeTextLayerCanvases(
      layer,
      maskCanvas,
      paintOverlayCanvas,
    ).composedCanvas

    context.drawImage(composedCanvas, 0, 0, layer.width, layer.height)
    context.restore()
    return
  }

  const source = layer.type === 'image'
    ? (layer.sourceKind === 'svg' ? layer.src : layer.bitmap)
    : layer.bitmap

  if (!source) {
    context.restore()
    return
  }

  if (layer.type === 'image' && layer.sourceKind === 'svg') {
    const cornerRadius = clampLayerCornerRadius(layer.width, layer.height, layer.cornerRadius ?? 0)
    const svgCanvasResult = await createCanvasFromRenderedSvgBox(
      source,
      layer.width,
      layer.height,
    )

    if (cornerRadius > 0) {
      drawRoundedRect(context, layer.width, layer.height, cornerRadius)
      context.clip()
    }

    context.drawImage(svgCanvasResult.canvas, 0, 0, layer.width, layer.height)
    context.restore()
    return
  }

  const image = await loadImageElement(source)
  if (layer.type === 'image') {
    const cornerRadius = clampLayerCornerRadius(layer.width, layer.height, layer.cornerRadius ?? 0)

    if (cornerRadius > 0) {
      drawRoundedRect(context, layer.width, layer.height, cornerRadius)
      context.clip()
    }
  }

  context.drawImage(image, 0, 0, layer.width, layer.height)
  context.restore()
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }

      reject(new Error('Export failed'))
    }, type, quality)
  })
}

export async function renderDocumentToCanvas(documentState, width, height, format = 'png') {
  const canvas = createSizedCanvas(width, height)
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas context is unavailable')
  }

  if (format === 'jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  } else {
    context.clearRect(0, 0, canvas.width, canvas.height)
  }

  for (const layer of documentState.layers) {
    await drawLayerToContext(context, layer)
  }

  return canvas
}

export async function exportDocumentImage(
  documentState,
  width,
  height,
  format = 'png',
  filenameBase = 'fukmall-export',
) {
  const normalizedFormat = format === 'jpeg' ? 'jpeg' : 'png'
  const mimeType = normalizedFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
  const extension = normalizedFormat === 'jpeg' ? 'jpg' : 'png'
  const quality = normalizedFormat === 'jpeg' ? 0.92 : undefined
  const exportCanvas = await renderDocumentToCanvas(
    documentState,
    width,
    height,
    normalizedFormat,
  )
  const blob = await canvasToBlob(exportCanvas, mimeType, quality)
  const objectUrl = URL.createObjectURL(blob)
  const downloadLink = document.createElement('a')

  downloadLink.href = objectUrl
  downloadLink.download = `${filenameBase}.${extension}`
  document.body.append(downloadLink)
  downloadLink.click()
  downloadLink.remove()
  URL.revokeObjectURL(objectUrl)
}
