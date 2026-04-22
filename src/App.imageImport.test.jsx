import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ASSET_DRAG_MIME_TYPE } from './editor/constants'

const imageRegistry = new Map()
let generatedBitmapCounter = 0

function setFileMockData(file, dataUrl, options = {}) {
  Object.defineProperty(file, '__mockDataUrl', {
    configurable: true,
    value: dataUrl,
  })

  if (options.readError) {
    Object.defineProperty(file, '__mockReadError', {
      configurable: true,
      value: true,
    })
  }
}

function registerImageSource(src, dimensionsOrError) {
  imageRegistry.set(src, dimensionsOrError)
}

function createPixelData(width, height, alpha = 255) {
  const data = new Uint8ClampedArray(width * height * 4)

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255
    data[index + 1] = 255
    data[index + 2] = 255
    data[index + 3] = alpha
  }

  return data
}

function createTransparentPaddedPixelData(width, height, bounds) {
  const data = createPixelData(width, height, 0)

  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      data[((y * width) + x) * 4 + 3] = 255
    }
  }

  return data
}

function ensureCanvasPixels(canvas) {
  const expectedLength = Math.max(1, canvas.width * canvas.height * 4)

  if (!(canvas.__pixelData instanceof Uint8ClampedArray) || canvas.__pixelData.length !== expectedLength) {
    canvas.__pixelData = new Uint8ClampedArray(expectedLength)
  }

  return canvas.__pixelData
}

function copyPixelsToCanvas(targetCanvas, source, sx, sy, sw, sh, dx, dy, dw, dh) {
  const targetPixels = ensureCanvasPixels(targetCanvas)
  const sourceWidth = source.width ?? source.naturalWidth ?? sw ?? dw ?? 0
  const sourceHeight = source.height ?? source.naturalHeight ?? sh ?? dh ?? 0
  const sourcePixels = source.__pixelData ?? createPixelData(sourceWidth, sourceHeight, 255)
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
      const sampledX = Math.min(
        sourceWidth - 1,
        sourceX + Math.floor((column / Math.max(targetWidth, 1)) * sourceSampleWidth),
      )
      const sampledY = Math.min(
        sourceHeight - 1,
        sourceY + Math.floor((row / Math.max(targetHeight, 1)) * sourceSampleHeight),
      )
      const sourceIndex = ((sampledY * sourceWidth) + sampledX) * 4
      const targetIndex = (((targetY + row) * targetCanvas.width) + (targetX + column)) * 4

      targetPixels[targetIndex] = sourcePixels[sourceIndex]
      targetPixels[targetIndex + 1] = sourcePixels[sourceIndex + 1]
      targetPixels[targetIndex + 2] = sourcePixels[sourceIndex + 2]
      targetPixels[targetIndex + 3] = sourcePixels[sourceIndex + 3]
    }
  }
}

function createImageFile(name, type, dataUrl, options = {}) {
  const file = new File(['image'], name, { type })
  setFileMockData(file, dataUrl, options)
  return file
}

function getInspector(container) {
  const inspector = container.querySelector('.inspector-panel')

  expect(inspector).not.toBeNull()

  return inspector
}

function getDirectImportInput(container) {
  return container.querySelector('input[accept="image/*"]')
}

function getAssetLibraryInput(container) {
  return container.querySelector('input[multiple]')
}

function createExternalFileDataTransfer(file) {
  return {
    files: [file],
    items: [
      {
        kind: 'file',
        type: file.type,
      },
    ],
    types: ['Files'],
    dropEffect: 'copy',
    effectAllowed: 'copy',
  }
}

function createAssetDataTransfer(assetId = '') {
  const data = new Map([[ASSET_DRAG_MIME_TYPE, assetId]])

  return {
    files: [],
    items: [],
    types: [ASSET_DRAG_MIME_TYPE],
    dropEffect: 'copy',
    effectAllowed: 'copy',
    setData(format, value) {
      data.set(format, value)
    },
    getData(format) {
      return data.get(format) ?? ''
    },
  }
}

describe('App image import flows', () => {
  const OriginalFileReader = globalThis.FileReader
  const OriginalImage = globalThis.Image
  const OriginalToDataURL = HTMLCanvasElement.prototype.toDataURL

  beforeEach(() => {
    window.localStorage.clear()
    imageRegistry.clear()
    generatedBitmapCounter = 0

    class MockFileReader {
      constructor() {
        this.result = null
        this.onload = null
        this.onerror = null
      }

      readAsDataURL(file) {
        queueMicrotask(() => {
          if (file.__mockReadError) {
            this.onerror?.(new Event('error'))
            return
          }

          this.result = file.__mockDataUrl ?? ''
          this.onload?.(new Event('load'))
        })
      }
    }

    class MockImage {
      constructor() {
        this.onload = null
        this.onerror = null
        this.naturalWidth = 0
        this.naturalHeight = 0
      }

      set src(value) {
        this._src = value
        const entry = imageRegistry.get(value)

        queueMicrotask(() => {
          if (!entry || entry.error) {
            this.onerror?.(new Event('error'))
            return
          }

          this.naturalWidth = entry.width
          this.naturalHeight = entry.height
          this.__pixelData = entry.pixelData
            ? new Uint8ClampedArray(entry.pixelData)
            : createPixelData(entry.width, entry.height, 255)
          this.onload?.(new Event('load'))
        })
      }

      get src() {
        return this._src
      }
    }

    globalThis.FileReader = MockFileReader
    globalThis.Image = MockImage

    vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function mockGetContext(contextType) {
        if (contextType !== '2d') {
          return null
        }

        const canvas = this

        return {
          font: '16px sans-serif',
          textAlign: 'left',
          textBaseline: 'alphabetic',
          fillStyle: '#000000',
          strokeStyle: '#000000',
          lineWidth: 1,
          measureText(text) {
            return {
              width: String(text ?? '').length * 9,
              actualBoundingBoxAscent: 12,
              actualBoundingBoxDescent: 4,
            }
          },
          clearRect(x = 0, y = 0, width = canvas.width, height = canvas.height) {
            const pixels = ensureCanvasPixels(canvas)

            for (let row = y; row < y + height; row += 1) {
              for (let column = x; column < x + width; column += 1) {
                const index = ((row * canvas.width) + column) * 4
                pixels[index] = 0
                pixels[index + 1] = 0
                pixels[index + 2] = 0
                pixels[index + 3] = 0
              }
            }
          },
          getImageData(x = 0, y = 0, width = canvas.width, height = canvas.height) {
            const pixels = ensureCanvasPixels(canvas)
            const data = new Uint8ClampedArray(width * height * 4)

            for (let row = 0; row < height; row += 1) {
              for (let column = 0; column < width; column += 1) {
                const sourceX = x + column
                const sourceY = y + row
                const targetIndex = ((row * width) + column) * 4

                if (
                  sourceX < 0 ||
                  sourceY < 0 ||
                  sourceX >= canvas.width ||
                  sourceY >= canvas.height
                ) {
                  continue
                }

                const sourceIndex = ((sourceY * canvas.width) + sourceX) * 4
                data[targetIndex] = pixels[sourceIndex]
                data[targetIndex + 1] = pixels[sourceIndex + 1]
                data[targetIndex + 2] = pixels[sourceIndex + 2]
                data[targetIndex + 3] = pixels[sourceIndex + 3]
              }
            }

            return { data }
          },
          putImageData(imageData, dx = 0, dy = 0) {
            const pixels = ensureCanvasPixels(canvas)

            for (let index = 0; index < imageData.data.length; index += 4) {
              const pixel = index / 4
              const x = pixel % canvas.width
              const y = Math.floor(pixel / canvas.width)
              const targetIndex = (((dy + y) * canvas.width) + (dx + x)) * 4
              pixels[targetIndex] = imageData.data[index]
              pixels[targetIndex + 1] = imageData.data[index + 1]
              pixels[targetIndex + 2] = imageData.data[index + 2]
              pixels[targetIndex + 3] = imageData.data[index + 3]
            }
          },
          drawImage(source, ...args) {
            if (args.length === 2) {
              copyPixelsToCanvas(canvas, source, 0, 0, source.width ?? source.naturalWidth, source.height ?? source.naturalHeight, args[0], args[1], source.width ?? source.naturalWidth, source.height ?? source.naturalHeight)
              return
            }

            if (args.length === 4) {
              copyPixelsToCanvas(canvas, source, 0, 0, source.width ?? source.naturalWidth, source.height ?? source.naturalHeight, args[0], args[1], args[2], args[3])
              return
            }

            if (args.length === 8) {
              copyPixelsToCanvas(canvas, source, ...args)
            }
          },
          fillText() {},
          strokeText() {},
          save() {},
          restore() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          quadraticCurveTo() {},
          closePath() {},
          fillRect() {},
          fill() {},
          clip() {},
          translate() {},
          rotate() {},
          scale() {},
        }
      })

    HTMLCanvasElement.prototype.toDataURL = function mockToDataURL() {
      const generatedSrc = `data:image/png;base64,trimmed-${generatedBitmapCounter += 1}`
      registerImageSource(generatedSrc, {
        width: this.width,
        height: this.height,
        pixelData: new Uint8ClampedArray(ensureCanvasPixels(this)),
      })
      return generatedSrc
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
    globalThis.FileReader = OriginalFileReader
    globalThis.Image = OriginalImage
    HTMLCanvasElement.prototype.toDataURL = OriginalToDataURL
    vi.restoreAllMocks()
    cleanup()
  })

  it('imports a direct image file without crashing even if current-document autosave fails', async () => {
    const file = createImageFile(
      'poster.png',
      'image/png',
      'data:image/png;base64,direct-import',
    )
    registerImageSource(file.__mockDataUrl, { width: 320, height: 180 })
    const originalSetItem = Storage.prototype.setItem

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function mockSetItem(key, value) {
      if (key === 'fukmall.current-document') {
        throw new Error('Quota exceeded')
      }

      return Reflect.apply(originalSetItem, this, [key, value])
    })

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const imageInput = getDirectImportInput(container)

    expect(imageInput).not.toBeNull()

    fireEvent.change(imageInput, {
      target: {
        files: [file],
      },
    })

    const inspector = getInspector(container)

    await waitFor(() => {
      expect(within(inspector).getByLabelText('Width')).toHaveValue(320)
      expect(within(inspector).getByLabelText('Height')).toHaveValue(180)
    })

    expect(screen.getByText('Current document could not be autosaved locally.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Image' })).toBeInTheDocument()
  }, 10000)

  it('trims transparent raster padding on direct import by default', async () => {
    const file = createImageFile(
      'trimmed.png',
      'image/png',
      'data:image/png;base64,trim-default',
    )
    registerImageSource(file.__mockDataUrl, {
      width: 7,
      height: 6,
      pixelData: createTransparentPaddedPixelData(7, 6, {
        x: 2,
        y: 1,
        width: 3,
        height: 2,
      }),
    })

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    fireEvent.change(getDirectImportInput(container), {
      target: {
        files: [file],
      },
    })

    const inspector = getInspector(container)

    await waitFor(() => {
      expect(within(inspector).getByLabelText('Width')).toHaveValue(5)
      expect(within(inspector).getByLabelText('Height')).toHaveValue(4)
    })
  })

  it('keeps original import dimensions when trim transparent imports is turned off', async () => {
    const file = createImageFile(
      'untrimmed.png',
      'image/png',
      'data:image/png;base64,trim-off',
    )
    registerImageSource(file.__mockDataUrl, {
      width: 7,
      height: 6,
      pixelData: createTransparentPaddedPixelData(7, 6, {
        x: 2,
        y: 1,
        width: 3,
        height: 2,
      }),
    })

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: /Trim Transparent Imports/i }))

    fireEvent.change(getDirectImportInput(container), {
      target: {
        files: [file],
      },
    })

    const inspector = getInspector(container)

    await waitFor(() => {
      expect(within(inspector).getByLabelText('Width')).toHaveValue(7)
      expect(within(inspector).getByLabelText('Height')).toHaveValue(6)
    })
  })

  it('imports a supported external desktop image drop through the shared file-import path', async () => {
    const file = createImageFile(
      'dropped.webp',
      'image/webp',
      'data:image/webp;base64,external-drop',
    )
    registerImageSource(file.__mockDataUrl, {
      width: 8,
      height: 8,
      pixelData: createTransparentPaddedPixelData(8, 8, {
        x: 2,
        y: 2,
        width: 3,
        height: 3,
      }),
    })

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const appShell = container.querySelector('.app-shell')

    expect(appShell).not.toBeNull()

    fireEvent.drop(appShell, {
      dataTransfer: createExternalFileDataTransfer(file),
    })

    const inspector = getInspector(container)

    await waitFor(() => {
      expect(within(inspector).getByLabelText('Width')).toHaveValue(5)
      expect(within(inspector).getByLabelText('Height')).toHaveValue(5)
    })
  })

  it('creates an image layer from an asset-library drop onto the canvas', async () => {
    const file = createImageFile(
      'asset.png',
      'image/png',
      'data:image/png;base64,asset-library',
    )
    registerImageSource(file.__mockDataUrl, {
      width: 10,
      height: 8,
      pixelData: createTransparentPaddedPixelData(10, 8, {
        x: 3,
        y: 2,
        width: 4,
        height: 3,
      }),
    })

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const assetLibraryInput = getAssetLibraryInput(container)

    expect(assetLibraryInput).not.toBeNull()

    fireEvent.change(assetLibraryInput, {
      target: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.asset-card')).not.toBeNull()
    })

    const assetCard = container.querySelector('.asset-card')
    expect(assetCard).not.toBeNull()
    const dragDataTransfer = createAssetDataTransfer()
    fireEvent.dragStart(assetCard, { dataTransfer: dragDataTransfer })

    const canvasStage = container.querySelector('.canvas-stage')

    expect(canvasStage).not.toBeNull()

    fireEvent.drop(canvasStage, {
      clientX: 150,
      clientY: 180,
      dataTransfer: dragDataTransfer,
    })

    const inspector = getInspector(container)

    await waitFor(() => {
      expect(within(inspector).getByLabelText('Width')).toHaveValue(6)
      expect(within(inspector).getByLabelText('Height')).toHaveValue(5)
    })
  })

  it('fails gracefully when an imported image cannot be decoded', async () => {
    const file = createImageFile(
      'broken.png',
      'image/png',
      'data:image/png;base64,broken-image',
    )
    registerImageSource(file.__mockDataUrl, { error: true })

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const imageInput = getDirectImportInput(container)

    expect(imageInput).not.toBeNull()

    fireEvent.change(imageInput, {
      target: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Image could not be loaded')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Add Image' })).toBeInTheDocument()
  })

  it('imports SVG files as valid SVG-backed image layers', async () => {
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2090%2045%22%3E%3C/svg%3E'
    const file = createImageFile('vector.svg', 'image/svg+xml', svgDataUrl)

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const imageInput = getDirectImportInput(container)

    expect(imageInput).not.toBeNull()

    fireEvent.change(imageInput, {
      target: {
        files: [file],
      },
    })

    const inspector = getInspector(container)

    await waitFor(() => {
      expect(within(inspector).getByLabelText('Width')).toHaveValue(90)
      expect(within(inspector).getByLabelText('Height')).toHaveValue(45)
    })

    const svgImage = container.querySelector(`img.layer-image[src="${svgDataUrl}"]`)
    expect(svgImage).not.toBeNull()
  })

  it('caps the asset library at 20 items, accepts only remaining slots, and shows a transient limit message', async () => {
    const files = Array.from({ length: 21 }, (_, index) => {
      const file = createImageFile(
        `asset-${index + 1}.png`,
        'image/png',
        `data:image/png;base64,asset-cap-${index + 1}`,
      )

      registerImageSource(file.__mockDataUrl, {
        width: 12,
        height: 12,
      })

      return file
    })

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    fireEvent.change(getAssetLibraryInput(container), {
      target: {
        files,
      },
    })

    await waitFor(() => {
      expect(container.querySelectorAll('.asset-card')).toHaveLength(20)
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Asset library limit reached. Added 20 assets; 1 was not imported.',
    )

    const extraFile = createImageFile(
      'asset-22.png',
      'image/png',
      'data:image/png;base64,asset-cap-22',
    )
    registerImageSource(extraFile.__mockDataUrl, {
      width: 12,
      height: 12,
    })

    fireEvent.change(getAssetLibraryInput(container), {
      target: {
        files: [extraFile],
      },
    })

    await waitFor(() => {
      expect(container.querySelectorAll('.asset-card')).toHaveLength(20)
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Asset library limit reached. Remove an asset before importing more.',
    )
  })
})
