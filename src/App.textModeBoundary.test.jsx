import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  CURRENT_DOCUMENT_STORAGE_KEY,
  parseProjectFile,
} from './lib/documentFiles'

function getInspector(container) {
  const inspector = container.querySelector('.inspector-panel')

  expect(inspector).not.toBeNull()

  return inspector
}

function getCanvasLayers(container) {
  return Array.from(container.querySelectorAll('.canvas-layer'))
}

function getNumericInput(inspector, labelText) {
  const label = Array.from(inspector.querySelectorAll('label')).find((candidate) => (
    candidate.querySelector('span')?.textContent === labelText
  ))

  expect(label).not.toBeNull()

  return label.querySelector('input')
}

function getSelectionFrame(container) {
  const frame = container.querySelector('.selection-frame.interactive')

  expect(frame).not.toBeNull()

  return frame
}

function getPersistedDocument() {
  const persisted = window.localStorage.getItem(CURRENT_DOCUMENT_STORAGE_KEY)

  expect(persisted).toBeTruthy()

  return parseProjectFile(persisted)
}

function getTextEditor(container) {
  const editor = container.querySelector('.text-layer-editor')

  expect(editor).not.toBeNull()

  return editor
}

async function createSelectedTextLayer(container) {
  fireEvent.click(screen.getByRole('button', { name: 'Add Text' }))

  await waitFor(() => {
    expect(getInspector(container).textContent).toContain('Font Size')
  })
}

async function enterEditModeFromTransformFrame(container) {
  fireEvent.doubleClick(getSelectionFrame(container), {
    clientX: 120,
    clientY: 70,
    buttons: 1,
  })

  await waitFor(() => {
    expect(container.querySelector('.text-layer-editor')).not.toBeNull()
    expect(container.querySelector('.selection-frame.interactive')).toBeNull()
  })
}

describe('App text edit and transform mode boundaries', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext

  beforeEach(() => {
    window.localStorage.clear()

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
        })
      })

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
    vi.restoreAllMocks()
    cleanup()
  })

  it('applies a pending font size input on the first outside click without requiring an extra click', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)

    const textLayerId = getPersistedDocument().selectedLayerId
    const fontSizeInput = getNumericInput(getInspector(container), 'Font Size')
    const backgroundLayer = getCanvasLayers(container)[0]

    expect(backgroundLayer).not.toBeUndefined()

    fireEvent.focus(fontSizeInput)
    fireEvent.change(fontSizeInput, { target: { value: '60' } })
    fireEvent.pointerDown(backgroundLayer, { clientX: 10, clientY: 500, buttons: 1 })

    await waitFor(() => {
      const documentState = getPersistedDocument()
      const updatedTextLayer = documentState.layers.find((layer) => layer.id === textLayerId)

      expect(updatedTextLayer?.fontSize).toBe(60)
      expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBe(1110)
      expect(Number(getNumericInput(getInspector(container), 'Height').value)).toBe(1470)
    })
  })

  it('double-clicking the transform selection frame enters edit mode every time', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    await enterEditModeFromTransformFrame(container)

    fireEvent.keyDown(getTextEditor(container), {
      key: 'Enter',
      ctrlKey: true,
    })

    await waitFor(() => {
      expect(container.querySelector('.text-layer-editor')).toBeNull()
      expect(container.querySelector('.selection-frame.interactive')).not.toBeNull()
    })

    await enterEditModeFromTransformFrame(container)
  })

  it('clicking outside the text editor exits edit mode and returns to transform mode', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    await enterEditModeFromTransformFrame(container)

    const canvasStage = container.querySelector('.canvas-stage')

    expect(canvasStage).not.toBeNull()

    fireEvent.pointerDown(canvasStage, { clientX: 390, clientY: 24, buttons: 1 })

    await waitFor(() => {
      expect(container.querySelector('.text-layer-editor')).toBeNull()
      expect(container.querySelector('.selection-frame.interactive')).not.toBeNull()
      expect(getInspector(container).textContent).toContain('Font Size')
    })
  })
})
