import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resizeBoxTextSpy = vi.fn()

vi.mock('./lib/textLayer', async () => {
  const actual = await vi.importActual('./lib/textLayer')

  return {
    ...actual,
    resizeBoxText: vi.fn((...args) => {
      resizeBoxTextSpy(...args)
      return actual.resizeBoxText(...args)
    }),
  }
})

import App from './App'

const VISIBLE_JSON_AUTO_FIT_TEXT_PAYLOAD = `{
  "texts": [
    {
      "Layer name": "Auto Fit Runtime Title",
      "text": "A much longer headline that needs fitting",
      "color": "#123456",
      "bolded": true,
      "font": "Arial, sans-serif",
      "size": 88,
      "alignment": "center",
      "x": 220,
      "y": 220,
      "width": 220,
      "height": 90,
      "addShadow": false,
      "layerPlacement": 0
    }
  ]
}`

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

function getHandle(container, direction) {
  const handle = container.querySelector(`[data-handle-direction="${direction}"]`)

  expect(handle).not.toBeNull()

  return handle
}

function getSelectionFrame(container) {
  const frame = container.querySelector('.selection-frame.interactive')

  expect(frame).not.toBeNull()

  return frame
}

async function createSelectedJsonAutoFitTextLayer(container) {
  fireEvent.change(screen.getAllByLabelText('JSON')[0], {
    target: { value: VISIBLE_JSON_AUTO_FIT_TEXT_PAYLOAD },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create From JSON' }))

  await waitFor(() => {
    expect(getInspector(container).textContent).toContain('Font Size')
    expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBe(220)
    expect(Number(getNumericInput(getInspector(container), 'Height').value)).toBe(90)
  })
}

describe('App live auto-fit box resize runtime', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext

  beforeEach(() => {
    window.localStorage.clear()
    resizeBoxTextSpy.mockReset()

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

  it('keeps live auto-fit resize above the minimum on slight shrink and updates the selection frame', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createSelectedJsonAutoFitTextLayer(container)

    const inspector = getInspector(container)
    const widthInput = getNumericInput(inspector, 'Width')
    const fontSizeInput = getNumericInput(inspector, 'Font Size')
    const handle = getHandle(container, 'e')

    const initialWidth = Number(widthInput.value)
    const initialFontSize = Number(fontSizeInput.value)

    fireEvent.pointerDown(handle, { clientX: 173, clientY: 76, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 230, clientY: 76, buttons: 1 })

    const grownWidth = await waitFor(() => {
      const nextWidth = Number(getNumericInput(getInspector(container), 'Width').value)
      expect(nextWidth).toBeGreaterThan(initialWidth)
      return nextWidth
    })
    const grownFontSize = Number(getNumericInput(getInspector(container), 'Font Size').value)

    expect(grownFontSize).toBeGreaterThan(initialFontSize)

    fireEvent.pointerMove(window, { clientX: 170, clientY: 76, buttons: 1 })

    await waitFor(() => {
      const nextWidth = Number(getNumericInput(getInspector(container), 'Width').value)
      const nextFontSize = Number(getNumericInput(getInspector(container), 'Font Size').value)

      expect(nextWidth).toBeLessThan(grownWidth)
      expect(nextFontSize).toBeLessThanOrEqual(grownFontSize)
      expect(nextFontSize).toBeGreaterThan(8)
    })

    const shrunkWidth = Number(getNumericInput(getInspector(container), 'Width').value)
    const shrunkFontSize = Number(getNumericInput(getInspector(container), 'Font Size').value)
    const frameWidth = Number.parseFloat(getSelectionFrame(container).style.width)

    expect(shrunkWidth).toBeLessThan(grownWidth)
    expect(shrunkFontSize).toBeGreaterThan(8)
    expect(frameWidth).toBeCloseTo(shrunkWidth)

    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBeCloseTo(shrunkWidth)
      expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBe(shrunkFontSize)
    })
  })

  it('bases repeated live auto-fit resize steps on the pointer-down text layer snapshot', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createSelectedJsonAutoFitTextLayer(container)

    const handle = getHandle(container, 'e')

    fireEvent.pointerDown(handle, { clientX: 173, clientY: 76, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 210, clientY: 76, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 230, clientY: 76, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 170, clientY: 76, buttons: 1 })

    await waitFor(() => {
      expect(resizeBoxTextSpy).toHaveBeenCalled()
    })

    const liveResizeCalls = resizeBoxTextSpy.mock.calls
      .map(([layer, width, height]) => ({ layer, width, height }))
      .filter((entry) => entry.width !== 220 || entry.height !== 90)

    expect(liveResizeCalls.length).toBeGreaterThan(1)

    for (const call of liveResizeCalls) {
      expect(call.layer.boxWidth ?? call.layer.width).toBe(220)
      expect(call.layer.boxHeight ?? call.layer.height).toBe(90)
      expect(call.layer.fontSize).toBe(19)
    }

    fireEvent.pointerUp(window)
  })
})
