import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ASSET_DRAG_MIME_TYPE } from './editor/constants'

const imageRegistry = new Map()

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

  beforeEach(() => {
    window.localStorage.clear()
    imageRegistry.clear()

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
  })

  it('imports a supported external desktop image drop through the shared file-import path', async () => {
    const file = createImageFile(
      'dropped.webp',
      'image/webp',
      'data:image/webp;base64,external-drop',
    )
    registerImageSource(file.__mockDataUrl, { width: 210, height: 140 })

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
      expect(within(inspector).getByLabelText('Width')).toHaveValue(210)
      expect(within(inspector).getByLabelText('Height')).toHaveValue(140)
    })
  })

  it('creates an image layer from an asset-library drop onto the canvas', async () => {
    const file = createImageFile(
      'asset.png',
      'image/png',
      'data:image/png;base64,asset-library',
    )
    registerImageSource(file.__mockDataUrl, { width: 256, height: 128 })

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
      expect(within(inspector).getByLabelText('Width')).toHaveValue(256)
      expect(within(inspector).getByLabelText('Height')).toHaveValue(128)
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
})
