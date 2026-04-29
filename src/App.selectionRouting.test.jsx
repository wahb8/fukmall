import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

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

async function createSelectedTextLayer(container) {
  fireEvent.click(screen.getByRole('button', { name: 'Add Text' }))

  await waitFor(() => {
    expect(getInspector(container).textContent).toContain('Font Size')
  })
}

async function selectBackgroundLayer(container) {
  const backgroundLayer = getCanvasLayers(container)[0]

  expect(backgroundLayer).not.toBeUndefined()

  fireEvent.pointerDown(backgroundLayer, { clientX: 10, clientY: 500, buttons: 1 })

  await waitFor(() => {
    expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBe(1110)
    expect(Number(getNumericInput(getInspector(container), 'Height').value)).toBe(1470)
  })
}

describe('App selection routing', () => {
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

  it('single-clicking a different canvas layer selects it immediately', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    await selectBackgroundLayer(container)

    expect(getInspector(container).textContent).not.toContain('Font Size')
  })

  it('double-clicking a text layer still enters text editing after selecting it', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    await selectBackgroundLayer(container)

    const textLayer = getCanvasLayers(container).at(-1)

    expect(textLayer).not.toBeUndefined()

    fireEvent.pointerDown(textLayer, { clientX: 120, clientY: 70, buttons: 1 })

    await waitFor(() => {
      expect(getInspector(container).textContent).toContain('Font Size')
    })

    fireEvent.doubleClick(textLayer, { clientX: 120, clientY: 70, buttons: 1 })

    await waitFor(() => {
      expect(container.querySelector('.text-layer-editor')).not.toBeNull()
    })
  })

  it('shift-click multi-selection still works across canvas layers', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)

    const backgroundLayer = getCanvasLayers(container)[0]

    expect(backgroundLayer).not.toBeUndefined()

    fireEvent.pointerDown(backgroundLayer, {
      clientX: 10,
      clientY: 500,
      buttons: 1,
      shiftKey: true,
    })

    await waitFor(() => {
      expect(container.textContent).toContain('2 layers selected')
    })
  })

  it('clicking an empty stage area still explicitly deselects', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    const canvasStage = container.querySelector('.canvas-stage')

    expect(canvasStage).not.toBeNull()

    fireEvent.pointerDown(canvasStage, { clientX: 10, clientY: 10, buttons: 1 })

    await waitFor(() => {
      expect(getInspector(container).textContent).toContain(
        'Select a layer from the canvas or the stack to edit its properties.',
      )
    })
  })

  it('clicking outside the canvas on non-preserving UI clears selection explicitly', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)

    const nonPreservingUi = container.querySelector('.editor-topbar')

    expect(nonPreservingUi).not.toBeNull()

    fireEvent.pointerDown(nonPreservingUi, { clientX: 10, clientY: 10, buttons: 1 })

    await waitFor(() => {
      expect(getInspector(container).textContent).toContain(
        'Select a layer from the canvas or the stack to edit its properties.',
      )
    })
  })
})
