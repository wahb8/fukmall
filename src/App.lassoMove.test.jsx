import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const DISPLAY_DOCUMENT_WIDTH = 428
const DEFAULT_DOCUMENT_WIDTH = 1080
const DEFAULT_DOCUMENT_HEIGHT = 1440
const DOCUMENT_SCALE = DISPLAY_DOCUMENT_WIDTH / DEFAULT_DOCUMENT_WIDTH

function createMockContext(canvas) {
  return {
    canvas,
    font: '16px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    lineDashOffset: 0,
    measureText(text) {
      const fontSizeMatch = String(this.font).match(/(\d+(?:\.\d+)?)px/)
      const fontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : 16

      return {
        width: String(text ?? '').length * Math.max(fontSize * 0.6, 1),
        actualBoundingBoxAscent: fontSize * 0.8,
        actualBoundingBoxDescent: fontSize * 0.2,
      }
    },
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
    strokeText() {},
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    clip() {},
    stroke() {},
    fill() {},
    setLineDash() {},
    drawImage() {},
    getImageData(x = 0, y = 0, width = 1, height = 1) {
      return {
        x,
        y,
        data: new Uint8ClampedArray(Math.max(1, width * height * 4)).fill(255),
      }
    },
    putImageData() {},
  }
}

function toClientPoint(x, y) {
  return {
    clientX: x * DOCUMENT_SCALE,
    clientY: y * DOCUMENT_SCALE,
  }
}

function getInspector(container) {
  const inspector = container.querySelector('.inspector-panel')

  expect(inspector).not.toBeNull()

  return inspector
}

function getNumericInput(inspector, labelText) {
  const label = Array.from(inspector.querySelectorAll('label')).find((candidate) => (
    candidate.querySelector('span')?.textContent === labelText
  ))

  expect(label).not.toBeNull()

  return label.querySelector('input')
}

function getCanvasLayers(container) {
  return Array.from(container.querySelectorAll('.canvas-layer'))
}

function getCanvasSurface(container) {
  const surface = container.querySelector('.canvas-surface')

  expect(surface).not.toBeNull()

  return surface
}

async function createDefaultFloatingSelection(container) {
  fireEvent.click(screen.getByRole('button', { name: 'Lasso' }))

  const sourceLayer = getCanvasLayers(container)[0]

  expect(sourceLayer).not.toBeUndefined()

  fireEvent.pointerDown(sourceLayer, {
    ...toClientPoint(100, 100),
    button: 0,
    buttons: 1,
  })

  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })

  fireEvent.pointerMove(window, {
    ...toClientPoint(140, 100),
    button: 0,
    buttons: 1,
  })
  fireEvent.pointerMove(window, {
    ...toClientPoint(140, 140),
    button: 0,
    buttons: 1,
  })
  fireEvent.pointerMove(window, {
    ...toClientPoint(100, 140),
    button: 0,
    buttons: 1,
  })
  fireEvent.pointerUp(window)

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Sel to Layer' })).toBeEnabled()
  })
}

describe('App lasso floating-selection drag', () => {
  const OriginalImage = globalThis.Image
  const OriginalToDataURL = HTMLCanvasElement.prototype.toDataURL

  beforeEach(() => {
    window.localStorage.clear()

    class MockImage {
      constructor() {
        this.onload = null
        this.onerror = null
        this.naturalWidth = 360
        this.naturalHeight = 260
      }

      set src(value) {
        this._src = value
        this.onload?.(new Event('load'))
      }

      get src() {
        return this._src
      }
    }

    globalThis.Image = MockImage

    vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function mockGetContext(contextType) {
        if (contextType !== '2d') {
          return null
        }

        if (!this.__mockContext) {
          this.__mockContext = createMockContext(this)
        }

        return this.__mockContext
      })

    vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockImplementation(() => 'data:image/png;base64,lasso-test')

    vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: DISPLAY_DOCUMENT_WIDTH,
        bottom: DEFAULT_DOCUMENT_HEIGHT * DOCUMENT_SCALE,
        width: DISPLAY_DOCUMENT_WIDTH,
        height: DEFAULT_DOCUMENT_HEIGHT * DOCUMENT_SCALE,
        toJSON: () => ({}),
      }))
  })

  afterEach(() => {
    globalThis.Image = OriginalImage

    if (OriginalToDataURL) {
      HTMLCanvasElement.prototype.toDataURL = OriginalToDataURL
    }

    vi.restoreAllMocks()
    cleanup()
  })

  it('keeps the floating selection under the pointer instead of jumping on drag', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createDefaultFloatingSelection(container)

    const canvasSurface = getCanvasSurface(container)

    fireEvent.pointerDown(canvasSurface, {
      ...toClientPoint(120, 120),
      button: 0,
      buttons: 1,
    })
    fireEvent.pointerMove(window, {
      ...toClientPoint(170, 190),
      button: 0,
      buttons: 1,
    })
    fireEvent.pointerUp(window)

    fireEvent.click(screen.getByRole('button', { name: 'Sel to Layer' }))

    const inspector = getInspector(container)

    await waitFor(() => {
      expect(Math.abs(Number(getNumericInput(inspector, 'X').value) - 170)).toBeLessThan(1)
      expect(Math.abs(Number(getNumericInput(inspector, 'Y').value) - 190)).toBeLessThan(1)
    })
  })

  it('preserves Shift axis lock while dragging a floating lasso selection', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createDefaultFloatingSelection(container)

    const canvasSurface = getCanvasSurface(container)

    fireEvent.pointerDown(canvasSurface, {
      ...toClientPoint(120, 120),
      button: 0,
      buttons: 1,
    })
    fireEvent.pointerMove(window, {
      ...toClientPoint(150, 122),
      button: 0,
      buttons: 1,
      shiftKey: true,
    })
    fireEvent.pointerMove(window, {
      ...toClientPoint(210, 127),
      button: 0,
      buttons: 1,
      shiftKey: true,
    })
    fireEvent.pointerUp(window)

    fireEvent.click(screen.getByRole('button', { name: 'Sel to Layer' }))

    const inspector = getInspector(container)

    await waitFor(() => {
      expect(Math.abs(Number(getNumericInput(inspector, 'X').value) - 210)).toBeLessThan(1)
      expect(Math.abs(Number(getNumericInput(inspector, 'Y').value) - 122)).toBeLessThan(1)
    })
  })
})
