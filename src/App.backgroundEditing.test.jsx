import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { CURRENT_DOCUMENT_STORAGE_KEY } from './lib/documentFiles'

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

describe('App background layer editing', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL
  const originalImage = globalThis.Image
  let bitmapCounter = 0

  beforeEach(() => {
    window.localStorage.clear()
    bitmapCounter = 0

    class MockImage {
      constructor() {
        this.onload = null
        this.onerror = null
        this.naturalWidth = 1080
        this.naturalHeight = 1440
      }

      set src(value) {
        this._src = value

        queueMicrotask(() => {
          this.onload?.(new Event('load'))
        })
      }

      get src() {
        return this._src
      }
    }

    globalThis.Image = MockImage

    vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function mockGetContext(contextType) {
        const context = originalGetContext.call(this, contextType)

        if (contextType !== '2d' || !context) {
          return context
        }

        return Object.assign(context, {
          getImageData: (x = 0, y = 0, width = 1, height = 1) => ({
            x,
            y,
            data: new Uint8ClampedArray(Math.max(1, width * height * 4)).fill(255),
          }),
          putImageData: () => {},
          fillRect: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          quadraticCurveTo: () => {},
          closePath: () => {},
          stroke: () => {},
          arc: () => {},
          fill: () => {},
          drawImage: () => {},
          clearRect: () => {},
          save: () => {},
          restore: () => {},
          translate: () => {},
          rotate: () => {},
          scale: () => {},
          clip: () => {},
          measureText(text) {
            return {
              width: String(text ?? '').length * 9,
              actualBoundingBoxAscent: 12,
              actualBoundingBoxDescent: 4,
            }
          },
        })
      })

    HTMLCanvasElement.prototype.toDataURL = function mockToDataURL() {
      bitmapCounter += 1
      return `data:image/png;base64,bitmap-${bitmapCounter}`
    }

    vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 428,
        bottom: 570,
        width: 428,
        height: 570,
        toJSON: () => ({}),
      }))
  })

  afterEach(() => {
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL
    globalThis.Image = originalImage
    vi.restoreAllMocks()
    cleanup()
  })

  it('seeds the background as a normal raster layer and lets raster-only inspector edits apply to it', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const initialPersisted = JSON.parse(window.localStorage.getItem(CURRENT_DOCUMENT_STORAGE_KEY))
    const initialBackgroundLayer = initialPersisted.document.layers[0]

    expect(initialBackgroundLayer.name).toBe('Background')
    expect(initialBackgroundLayer.type).toBe('raster')

    const backgroundLayer = getCanvasLayers(container)[0]

    fireEvent.pointerDown(backgroundLayer, { clientX: 10, clientY: 500, buttons: 1 })

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBe(1080)
      expect(Number(getNumericInput(getInspector(container), 'Height').value)).toBe(1440)
    })

    expect(screen.queryByText('Fill')).toBeNull()
    expect(screen.getByText(/Drawing layers support alpha lock/i)).toBeInTheDocument()

    const alphaLockButton = screen.getByRole('button', { name: 'Lock Transparent Pixels' })

    expect(alphaLockButton).toBeEnabled()

    fireEvent.click(alphaLockButton)

    await waitFor(() => {
      const persisted = JSON.parse(window.localStorage.getItem(CURRENT_DOCUMENT_STORAGE_KEY))
      const persistedBackgroundLayer = persisted.document.layers[0]

      expect(persistedBackgroundLayer.type).toBe('raster')
      expect(persistedBackgroundLayer.lockTransparentPixels).toBe(true)
    })
  })
})
