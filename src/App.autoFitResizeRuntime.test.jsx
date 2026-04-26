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

const LONG_JSON_TEXT_PAYLOAD = `{
  "texts": [
    {
      "Layer name": "Runtime Resize Text",
      "text": "A much longer headline that needs fitting after resize",
      "color": "#123456",
      "bolded": false,
      "font": "Arial, sans-serif",
      "size": 42,
      "alignment": "left",
      "x": 220,
      "y": 140,
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

function getSharedSelectionFrame(container) {
  const frame = container.querySelector('.shared-selection-frame')

  expect(frame).not.toBeNull()

  return frame
}

function getLayerRowByName(container, name) {
  const input = Array.from(container.querySelectorAll('.layer-name-input')).find(
    (candidate) => candidate.value === name,
  )

  expect(input).not.toBeUndefined()

  return input.closest('.layer-row')
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

async function createSelectedLongJsonTextLayer(container) {
  fireEvent.change(screen.getAllByLabelText('JSON')[0], {
    target: { value: LONG_JSON_TEXT_PAYLOAD },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create From JSON' }))

  await waitFor(() => {
    expect(getInspector(container).textContent).toContain('Font Size')
    expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBe(42)
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
        <App editorChromeEnabled />
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
        <App editorChromeEnabled />
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

  it('keeps corner-resized auto-fit box text above the minimum after an enlarge then slight shrink across drags', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedJsonAutoFitTextLayer(container)

    const getWidth = () => Number(getNumericInput(getInspector(container), 'Width').value)
    const getHeight = () => Number(getNumericInput(getInspector(container), 'Height').value)
    const getFontSize = () => Number(getNumericInput(getInspector(container), 'Font Size').value)
    const handle = getHandle(container, 'se')
    const initialWidth = getWidth()
    const initialHeight = getHeight()
    const initialFontSize = getFontSize()

    fireEvent.pointerDown(handle, { clientX: 173, clientY: 128, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 236, clientY: 176, buttons: 1 })

    await waitFor(() => {
      expect(getWidth()).toBeGreaterThan(initialWidth)
      expect(getHeight()).toBeGreaterThan(initialHeight)
      expect(getFontSize()).toBeGreaterThan(initialFontSize)
    })

    const grownWidth = getWidth()
    const grownHeight = getHeight()
    const grownFontSize = getFontSize()

    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(getWidth()).toBe(grownWidth)
      expect(getHeight()).toBe(grownHeight)
      expect(getFontSize()).toBe(grownFontSize)
    })

    fireEvent.pointerDown(handle, { clientX: 236, clientY: 176, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 224, clientY: 166, buttons: 1 })

    await waitFor(() => {
      expect(getWidth()).toBeLessThan(grownWidth)
      expect(getHeight()).toBeLessThan(grownHeight)
      expect(getFontSize()).toBeLessThanOrEqual(grownFontSize)
      expect(getFontSize()).toBeGreaterThan(8)
    })

    const shrunkWidth = getWidth()
    const shrunkHeight = getHeight()
    const shrunkFontSize = getFontSize()
    const frame = getSelectionFrame(container)

    expect(Number.parseFloat(frame.style.width)).toBeCloseTo(shrunkWidth)
    expect(Number.parseFloat(frame.style.height)).toBeCloseTo(shrunkHeight)
    expect(shrunkFontSize).toBeGreaterThan(8)

    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(getWidth()).toBe(shrunkWidth)
      expect(getHeight()).toBe(shrunkHeight)
      expect(getFontSize()).toBe(shrunkFontSize)
    })
  })

  it('keeps multi-selection auto-fit box resize stable when reversing from grow to shrink', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedJsonAutoFitTextLayer(container)
    fireEvent.click(screen.getByRole('button', { name: 'Add Text' }))

    const autoFitRow = getLayerRowByName(container, 'Auto Fit Runtime Title')
    const newTextRow = getLayerRowByName(container, 'New Text')

    fireEvent.click(autoFitRow)

    const initialFontSize = await waitFor(() => {
      const nextFontSize = Number(getNumericInput(getInspector(container), 'Font Size').value)
      expect(nextFontSize).toBeGreaterThan(8)
      return nextFontSize
    })

    fireEvent.click(newTextRow, { shiftKey: true })

    await waitFor(() => {
      expect(container.textContent).toContain('2 layers selected')
    })

    resizeBoxTextSpy.mockReset()

    const handle = getSharedSelectionFrame(container).querySelector('[data-handle-direction="se"]')
    expect(handle).not.toBeNull()
    fireEvent.pointerDown(handle, { clientX: 240, clientY: 180, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 280, clientY: 220, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 250, clientY: 188, buttons: 1 })

    await waitFor(() => {
      expect(
        resizeBoxTextSpy.mock.calls.some(([layer]) => layer.name === 'Auto Fit Runtime Title'),
      ).toBe(true)
    })

    const autoFitCalls = resizeBoxTextSpy.mock.calls
      .map(([layer, width, height]) => ({ layer, width, height }))
      .filter((entry) => entry.layer.name === 'Auto Fit Runtime Title')

    expect(autoFitCalls.length).toBeGreaterThan(1)

    for (const call of autoFitCalls) {
      expect(call.layer.boxWidth ?? call.layer.width).toBe(220)
      expect(call.layer.boxHeight ?? call.layer.height).toBe(90)
      expect(call.layer.fontSize).toBe(initialFontSize)
    }

    const lastAutoFitCall = autoFitCalls.at(-1)
    const frame = getSharedSelectionFrame(container)

    expect(Number.parseFloat(frame.style.width)).toBeGreaterThan(0)
    expect(lastAutoFitCall).toBeDefined()

    fireEvent.pointerUp(window)

    fireEvent.click(getLayerRowByName(container, 'Auto Fit Runtime Title'))

    await waitFor(() => {
      expect(getInspector(container).textContent).toContain('Font Size')
      expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBeCloseTo(lastAutoFitCall.width)
      expect(Number(getNumericInput(getInspector(container), 'Height').value)).toBeCloseTo(lastAutoFitCall.height)
      expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBeGreaterThan(8)
    })

    const singleFrame = getSelectionFrame(container)

    expect(Number.parseFloat(singleFrame.style.width)).toBeCloseTo(lastAutoFitCall.width)
    expect(Number.parseFloat(singleFrame.style.height)).toBeCloseTo(lastAutoFitCall.height)
  })

  it('initializes exact-size auto-fit creation through the shared resize path before the first drag', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedJsonAutoFitTextLayer(container)

    const frame = getSelectionFrame(container)
    const creationCall = resizeBoxTextSpy.mock.calls.find(([, width, height]) => (
      width === 220 && height === 90
    ))

    expect(creationCall).toBeDefined()
    expect(Number.parseFloat(frame.style.width)).toBeCloseTo(220)
    expect(Number.parseFloat(frame.style.height)).toBeCloseTo(90)

    resizeBoxTextSpy.mockReset()

    fireEvent.pointerDown(getHandle(container, 'e'), { clientX: 173, clientY: 76, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 190, clientY: 76, buttons: 1 })

    const firstLiveCall = await waitFor(() => {
      const nextCall = resizeBoxTextSpy.mock.calls[0]
      expect(nextCall).toBeDefined()
      return nextCall
    })

    expect(firstLiveCall[0].autoFitSourceFontSize).toBe(88)
    expect(firstLiveCall[0].boxWidth ?? firstLiveCall[0].width).toBe(220)
    expect(firstLiveCall[0].boxHeight ?? firstLiveCall[0].height).toBe(90)

    fireEvent.pointerUp(window)
  })

  it('rebases editor-created box text once, then keeps a stable auto-fit source across later drags', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedLongJsonTextLayer(container)

    const handle = getHandle(container, 'se')

    fireEvent.pointerDown(handle, { clientX: 173, clientY: 128, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 240, clientY: 180, buttons: 1 })

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBeGreaterThan(42)
    })

    fireEvent.pointerUp(window)

    resizeBoxTextSpy.mockReset()

    fireEvent.pointerDown(getHandle(container, 'se'), { clientX: 240, clientY: 180, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 228, clientY: 170, buttons: 1 })

    const firstLiveCall = await waitFor(() => {
      const nextCall = resizeBoxTextSpy.mock.calls[0]
      expect(nextCall).toBeDefined()
      return nextCall
    })

    expect(firstLiveCall[0].autoFitSourceFontSize).toBe(42)
    expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBeGreaterThan(8)

    fireEvent.pointerUp(window)
  })

  it('recovers upward after touching the minimum fitted font size region', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedJsonAutoFitTextLayer(container)

    const getWidth = () => Number(getNumericInput(getInspector(container), 'Width').value)
    const getHeight = () => Number(getNumericInput(getInspector(container), 'Height').value)
    const getFontSize = () => Number(getNumericInput(getInspector(container), 'Font Size').value)
    const handle = () => getHandle(container, 'se')

    fireEvent.pointerDown(handle(), { clientX: 173, clientY: 128, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 70, clientY: 92, buttons: 1 })

    await waitFor(() => {
      expect(getFontSize()).toBe(8)
    })

    const minimumWidth = getWidth()
    const minimumHeight = getHeight()
    const minimumFrame = getSelectionFrame(container)

    expect(Number.parseFloat(minimumFrame.style.width)).toBeCloseTo(minimumWidth)
    expect(Number.parseFloat(minimumFrame.style.height)).toBeCloseTo(minimumHeight)

    fireEvent.pointerMove(window, { clientX: 220, clientY: 162, buttons: 1 })

    await waitFor(() => {
      expect(getWidth()).toBeGreaterThan(minimumWidth)
      expect(getHeight()).toBeGreaterThan(minimumHeight)
      expect(getFontSize()).toBeGreaterThan(8)
    })

    const recoveredWidth = getWidth()
    const recoveredHeight = getHeight()
    const recoveredFontSize = getFontSize()

    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(getWidth()).toBe(recoveredWidth)
      expect(getHeight()).toBe(recoveredHeight)
      expect(getFontSize()).toBe(recoveredFontSize)
    })
  })
})
