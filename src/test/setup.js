import '@testing-library/jest-dom/vitest'

class MockCanvasRenderingContext2D {
  constructor() {
    this.font = '16px sans-serif'
    this.textAlign = 'left'
    this.textBaseline = 'alphabetic'
    this.fillStyle = '#000000'
    this.strokeStyle = '#000000'
    this.lineWidth = 1
  }

  measureText(text) {
    const fontSizeMatch = String(this.font).match(/(\d+(?:\.\d+)?)px/)
    const fontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : 16

    return {
      width: String(text ?? '').length * Math.max(fontSize * 0.6, 1),
    }
  }

  clearRect() {}
  fillText() {}
  strokeText() {}
  save() {}
  restore() {}
  drawImage() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  closePath() {}
  fillRect() {}
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value(contextType) {
    if (contextType === '2d') {
      return new MockCanvasRenderingContext2D()
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
