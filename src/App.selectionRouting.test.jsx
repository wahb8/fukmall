import { StrictMode } from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
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

function getSelectionFrame(container) {
  const frame = container.querySelector('.selection-frame.interactive')

  expect(frame).not.toBeNull()

  return frame
}

function getNumericInput(inspector, labelText) {
  const label = Array.from(inspector.querySelectorAll('label')).find((candidate) => (
    candidate.querySelector('span')?.textContent === labelText
  ))

  expect(label).not.toBeNull()

  return label.querySelector('input')
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

  it('single-clicking an unselected layer selects it immediately', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const inspector = getInspector(container)
    const shapeLayer = getCanvasLayers(container)[2]

    expect(inspector.textContent).toContain('Rounded Corners')

    fireEvent.pointerDown(shapeLayer, { clientX: 200, clientY: 110, buttons: 1 })

    await waitFor(() => {
      expect(getInspector(container).textContent).toContain('Fill')
    })

    expect(getInspector(container).textContent).not.toContain('Rounded Corners')
  })

  it('when the full-canvas background is selected, clicking a front layer through that frame selects the front layer immediately', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const backgroundLayer = getCanvasLayers(container)[0]

    expect(backgroundLayer).not.toBeUndefined()

    fireEvent.pointerDown(backgroundLayer, { clientX: 10, clientY: 500, buttons: 1 })

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBe(1080)
      expect(Number(getNumericInput(getInspector(container), 'Height').value)).toBe(1440)
    })

    fireEvent.pointerDown(getSelectionFrame(container), { clientX: 200, clientY: 110, buttons: 1 })

    await waitFor(() => {
      expect(getInspector(container).textContent).toContain('Fill')
      expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBe(220)
      expect(Number(getNumericInput(getInspector(container), 'Height').value)).toBe(220)
    })
  })

  it('single-clicking a text layer selects it immediately', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const textLayer = getCanvasLayers(container)[3]

    fireEvent.pointerDown(textLayer, { clientX: 120, clientY: 70, buttons: 1 })

    await waitFor(() => {
      expect(getInspector(container).textContent).toContain('Text Shadow')
    })

    expect(getInspector(container).textContent).toContain('Text Mode')
  })

  it('double-clicking a text layer still enters text editing after selecting it', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const textLayer = getCanvasLayers(container)[3]

    fireEvent.pointerDown(textLayer, { clientX: 120, clientY: 70, buttons: 1 })

    await waitFor(() => {
      expect(getInspector(container).textContent).toContain('Text Shadow')
    })

    fireEvent.doubleClick(textLayer, { clientX: 120, clientY: 70, buttons: 1 })

    await waitFor(() => {
      expect(container.querySelector('.text-layer-editor')).not.toBeNull()
    })
  })

  it('selecting a different layer does not require an intermediate deselect', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const shapeLayer = getCanvasLayers(container)[2]
    const heroLayer = getCanvasLayers(container)[1]

    fireEvent.pointerDown(shapeLayer, { clientX: 200, clientY: 110, buttons: 1 })

    await waitFor(() => {
      expect(getInspector(container).textContent).toContain('Fill')
    })

    fireEvent.pointerDown(heroLayer, { clientX: 60, clientY: 120, buttons: 1 })

    await waitFor(() => {
      expect(getInspector(container).textContent).toContain('Rounded Corners')
    })
  })

  it('shift-click multi-selection still works', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const shapeLayer = getCanvasLayers(container)[2]

    fireEvent.pointerDown(shapeLayer, {
      clientX: 170,
      clientY: 110,
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
        <App />
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
})
