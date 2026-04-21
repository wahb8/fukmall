import '@testing-library/jest-dom/vitest'

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)))
}

function parseColor(style) {
  if (typeof style !== 'string') {
    return [0, 0, 0, 255]
  }

  const normalizedStyle = style.trim().toLowerCase()

  if (normalizedStyle.startsWith('#')) {
    const hex = normalizedStyle.slice(1)

    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        255,
      ]
    }

    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        255,
      ]
    }
  }

  const rgbaMatch = normalizedStyle.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/,
  )

  if (rgbaMatch) {
    return [
      clampChannel(rgbaMatch[1]),
      clampChannel(rgbaMatch[2]),
      clampChannel(rgbaMatch[3]),
      rgbaMatch[4] === undefined ? 255 : clampChannel(Number(rgbaMatch[4]) * 255),
    ]
  }

  return [0, 0, 0, 255]
}

class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas
    this.font = '16px sans-serif'
    this.textAlign = 'left'
    this.textBaseline = 'alphabetic'
    this.fillStyle = '#000000'
    this.strokeStyle = '#000000'
    this.lineWidth = 1
    this._operations = []
  }

  resolvePixel(x, y) {
    const width = Math.max(0, Math.floor(Number(this.canvas?.width) || 0))
    const height = Math.max(0, Math.floor(Number(this.canvas?.height) || 0))

    if (x < 0 || y < 0 || x >= width || y >= height) {
      return [0, 0, 0, 0]
    }

    for (let index = this._operations.length - 1; index >= 0; index -= 1) {
      const operation = this._operations[index]

      if (
        x < operation.left ||
        y < operation.top ||
        x >= operation.right ||
        y >= operation.bottom
      ) {
        continue
      }

      if (operation.type === 'fillRect') {
        return operation.rgba
      }

      if (operation.type === 'clearRect') {
        return [0, 0, 0, 0]
      }

      if (operation.type === 'drawImage') {
        const localX = x - operation.left
        const localY = y - operation.top
        const sourceX = Math.min(
          operation.sourceWidth - 1,
          Math.max(0, Math.floor((localX / Math.max(operation.targetWidth, 1)) * operation.sourceWidth)),
        )
        const sourceY = Math.min(
          operation.sourceHeight - 1,
          Math.max(0, Math.floor((localY / Math.max(operation.targetHeight, 1)) * operation.sourceHeight)),
        )

        return operation.sourceContext.resolvePixel(
          operation.sourceLeft + sourceX,
          operation.sourceTop + sourceY,
        )
      }
    }

    return [0, 0, 0, 0]
  }

  measureText(text) {
    const fontSizeMatch = String(this.font).match(/(\d+(?:\.\d+)?)px/)
    const fontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : 16

    return {
      width: String(text ?? '').length * Math.max(fontSize * 0.6, 1),
      actualBoundingBoxAscent: fontSize * 0.8,
      actualBoundingBoxDescent: fontSize * 0.2,
    }
  }

  clearRect(x = 0, y = 0, width = this.canvas?.width ?? 0, height = this.canvas?.height ?? 0) {
    const left = Math.max(0, Math.floor(x))
    const top = Math.max(0, Math.floor(y))
    const right = Math.max(left, Math.min(this.canvas.width, Math.ceil(x + width)))
    const bottom = Math.max(top, Math.min(this.canvas.height, Math.ceil(y + height)))

    this._operations.push({ type: 'clearRect', left, top, right, bottom })
  }

  fillRect(x = 0, y = 0, width = 0, height = 0) {
    const rgba = parseColor(this.fillStyle)
    const left = Math.floor(x)
    const top = Math.floor(y)
    const right = Math.ceil(x + width)
    const bottom = Math.ceil(y + height)

    this._operations.push({ type: 'fillRect', left, top, right, bottom, rgba })
  }

  drawImage(sourceCanvas, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (!sourceCanvas || typeof sourceCanvas.getContext !== 'function') {
      return
    }

    const sourceContext = sourceCanvas.getContext('2d')

    if (!sourceContext || typeof sourceContext.resolvePixel !== 'function') {
      return
    }

    this._operations.push({
      type: 'drawImage',
      left: Math.floor(dx),
      top: Math.floor(dy),
      right: Math.ceil(dx + dw),
      bottom: Math.ceil(dy + dh),
      targetWidth: Math.max(0, Math.floor(dw)),
      targetHeight: Math.max(0, Math.floor(dh)),
      sourceLeft: Math.floor(sx),
      sourceTop: Math.floor(sy),
      sourceWidth: Math.max(0, Math.floor(sw)),
      sourceHeight: Math.max(0, Math.floor(sh)),
      sourceContext,
    })
  }

  getImageData(x = 0, y = 0, width = 0, height = 0) {
    const outputWidth = Math.max(0, Math.floor(width))
    const outputHeight = Math.max(0, Math.floor(height))
    const data = new Uint8ClampedArray(outputWidth * outputHeight * 4)

    for (let offsetY = 0; offsetY < outputHeight; offsetY += 1) {
      for (let offsetX = 0; offsetX < outputWidth; offsetX += 1) {
        const sourceX = Math.floor(x) + offsetX
        const sourceY = Math.floor(y) + offsetY
        const outputIndex = ((offsetY * outputWidth) + offsetX) * 4

        if (
          sourceX < 0 ||
          sourceY < 0 ||
          sourceX >= this.canvas.width ||
          sourceY >= this.canvas.height
        ) {
          continue
        }

        const rgba = this.resolvePixel(sourceX, sourceY)
        data[outputIndex] = rgba[0]
        data[outputIndex + 1] = rgba[1]
        data[outputIndex + 2] = rgba[2]
        data[outputIndex + 3] = rgba[3]
      }
    }

    return {
      data,
      width: outputWidth,
      height: outputHeight,
    }
  }

  fillText() {}
  strokeText() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  closePath() {}
  rect() {}
  clip() {}
  setLineDash() {}
  strokeRect() {}
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value(contextType) {
    if (contextType === '2d') {
      if (!this.__mockContext2d) {
        this.__mockContext2d = new MockCanvasRenderingContext2D(this)
      }

      return this.__mockContext2d
    }

    return null
  },
})

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: globalThis.crypto ?? {
    randomUUID: () => `test-uuid-${Math.random().toString(16).slice(2)}`,
  },
})
