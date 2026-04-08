import '@testing-library/jest-dom/vitest'

class MockCanvasRenderingContext2D {
  constructor() {
    this.font = '16px sans-serif'
    this.textAlign = 'left'
    this.textBaseline = 'alphabetic'
    this.fillStyle = '#000000'
  }

  measureText(text) {
    return {
      width: String(text ?? '').length * 10,
    }
  }

  clearRect() {}
  fillText() {}
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
