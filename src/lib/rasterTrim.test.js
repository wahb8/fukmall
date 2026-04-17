import { afterEach, describe, expect, it } from 'vitest'
import { findVisibleAlphaBounds, trimCanvasTransparentBounds } from './raster'

function createPixels(width, height, alpha = 0) {
  const pixels = new Uint8ClampedArray(width * height * 4)

  for (let index = 3; index < pixels.length; index += 4) {
    pixels[index] = alpha
  }

  return pixels
}

function setPixelAlpha(pixels, width, x, y, alpha) {
  pixels[((y * width) + x) * 4 + 3] = alpha
}

function createFakeCanvas(width, height, initialPixels = null) {
  const canvas = {
    width,
    height,
    __pixels: initialPixels ? new Uint8ClampedArray(initialPixels) : createPixels(width, height),
  }

  canvas.getContext = () => ({
    getImageData(x = 0, y = 0, sampleWidth = canvas.width, sampleHeight = canvas.height) {
      const data = new Uint8ClampedArray(sampleWidth * sampleHeight * 4)

      for (let row = 0; row < sampleHeight; row += 1) {
        for (let column = 0; column < sampleWidth; column += 1) {
          const sourceX = x + column
          const sourceY = y + row
          const targetIndex = ((row * sampleWidth) + column) * 4

          if (
            sourceX < 0 ||
            sourceY < 0 ||
            sourceX >= canvas.width ||
            sourceY >= canvas.height
          ) {
            continue
          }

          const sourceIndex = ((sourceY * canvas.width) + sourceX) * 4
          data[targetIndex] = canvas.__pixels[sourceIndex]
          data[targetIndex + 1] = canvas.__pixels[sourceIndex + 1]
          data[targetIndex + 2] = canvas.__pixels[sourceIndex + 2]
          data[targetIndex + 3] = canvas.__pixels[sourceIndex + 3]
        }
      }

      return { data }
    },
    drawImage(sourceCanvas, sx, sy, sw, sh, dx, dy, dw, dh) {
      const sourcePixels = sourceCanvas.__pixels ?? new Uint8ClampedArray()
      const sourceWidth = sourceCanvas.width ?? sourceCanvas.naturalWidth ?? sw ?? dw ?? 0
      const sourceHeight = sourceCanvas.height ?? sourceCanvas.naturalHeight ?? sh ?? dh ?? 0
      const sourceX = sx ?? 0
      const sourceY = sy ?? 0
      const sourceSampleWidth = sw ?? sourceWidth
      const sourceSampleHeight = sh ?? sourceHeight
      const targetX = dx ?? 0
      const targetY = dy ?? 0
      const targetWidth = dw ?? sourceSampleWidth
      const targetHeight = dh ?? sourceSampleHeight

      for (let row = 0; row < targetHeight; row += 1) {
        for (let column = 0; column < targetWidth; column += 1) {
          const sampledX = sourceX + Math.floor((column / Math.max(targetWidth, 1)) * sourceSampleWidth)
          const sampledY = sourceY + Math.floor((row / Math.max(targetHeight, 1)) * sourceSampleHeight)
          const sourceIndex = ((sampledY * sourceWidth) + sampledX) * 4
          const targetIndex = (((targetY + row) * canvas.width) + (targetX + column)) * 4

          canvas.__pixels[targetIndex] = sourcePixels[sourceIndex]
          canvas.__pixels[targetIndex + 1] = sourcePixels[sourceIndex + 1]
          canvas.__pixels[targetIndex + 2] = sourcePixels[sourceIndex + 2]
          canvas.__pixels[targetIndex + 3] = sourcePixels[sourceIndex + 3]
        }
      }
    },
  })

  return canvas
}

describe('raster transparent trimming helpers', () => {
  const originalCreateElement = document.createElement.bind(document)

  afterEach(() => {
    document.createElement = originalCreateElement
  })

  it('finds visible alpha bounds with threshold and padding', () => {
    const pixels = createPixels(6, 5)
    setPixelAlpha(pixels, 6, 2, 1, 255)
    setPixelAlpha(pixels, 6, 3, 3, 32)

    expect(findVisibleAlphaBounds(pixels, 6, 5, {
      alphaThreshold: 8,
      padding: 1,
    })).toEqual({
      x: 1,
      y: 0,
      width: 4,
      height: 5,
    })
  })

  it('returns a trimmed canvas when transparent outer padding exists', () => {
    const pixels = createPixels(5, 5)
    setPixelAlpha(pixels, 5, 2, 2, 255)
    const sourceCanvas = createFakeCanvas(5, 5, pixels)

    document.createElement = (tagName) => (
      tagName === 'canvas' ? createFakeCanvas(0, 0) : originalCreateElement(tagName)
    )

    const trimmed = trimCanvasTransparentBounds(sourceCanvas, {
      alphaThreshold: 8,
      padding: 1,
    })

    expect(trimmed.didTrim).toBe(true)
    expect(trimmed.isEmpty).toBe(false)
    expect(trimmed.width).toBe(3)
    expect(trimmed.height).toBe(3)
    expect(trimmed.offsetX).toBe(1)
    expect(trimmed.offsetY).toBe(1)
  })

  it('returns identity when the image already fills the canvas or is fully transparent', () => {
    const opaquePixels = createPixels(3, 2, 255)
    const opaqueCanvas = createFakeCanvas(3, 2, opaquePixels)
    const transparentCanvas = createFakeCanvas(4, 4, createPixels(4, 4))

    expect(trimCanvasTransparentBounds(opaqueCanvas).didTrim).toBe(false)

    const transparentResult = trimCanvasTransparentBounds(transparentCanvas)
    expect(transparentResult.didTrim).toBe(false)
    expect(transparentResult.isEmpty).toBe(true)
    expect(transparentResult.width).toBe(4)
    expect(transparentResult.height).toBe(4)
  })
})
