import { StrictMode } from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

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

function getCanvasLayers(container) {
  return Array.from(container.querySelectorAll('.canvas-layer'))
}

describe('App resize handle routing', () => {
  let getBoundingClientRectSpy
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
          getImageData: (_x = 0, _y = 0, width = 1, height = 1) => ({
            data: new Uint8ClampedArray(Math.max(1, width * height * 4)).fill(255),
          }),
          putImageData: () => {},
        })
      })

    getBoundingClientRectSpy = vi
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

  it.each([
    {
      direction: 'w',
      start: { x: 30, y: 76 },
      move: { x: 10, y: 76 },
      changedLabel: 'Width',
      unchangedLabel: 'Y',
    },
    {
      direction: 'e',
      start: { x: 173, y: 76 },
      move: { x: 193, y: 76 },
      changedLabel: 'Width',
      unchangedLabel: 'Y',
    },
    {
      direction: 'n',
      start: { x: 101, y: 25 },
      move: { x: 101, y: 5 },
      changedLabel: 'Height',
      unchangedLabel: 'X',
    },
    {
      direction: 's',
      start: { x: 101, y: 128 },
      move: { x: 101, y: 148 },
      changedLabel: 'Height',
      unchangedLabel: 'X',
    },
  ])('dragging $direction handle resizes without deselecting or moving', async ({
    direction,
    start,
    move,
    changedLabel,
    unchangedLabel,
  }) => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const inspector = getInspector(container)
    const changedInput = getNumericInput(inspector, changedLabel)
    const unchangedInput = getNumericInput(inspector, unchangedLabel)
    const initialChangedValue = Number(changedInput.value)
    const initialUnchangedValue = Number(unchangedInput.value)
    const handle = getHandle(container, direction)

    fireEvent.pointerDown(handle, { clientX: start.x, clientY: start.y, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: move.x, clientY: move.y, buttons: 1 })

    await waitFor(() => {
      expect(Number(changedInput.value)).not.toBe(initialChangedValue)
    })

    expect(Number(unchangedInput.value)).toBe(initialUnchangedValue)
    expect(container.querySelector('.selection-frame.interactive')).not.toBeNull()

    fireEvent.pointerUp(window)
  })

  it('interior frame drag still moves without resizing', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const inspector = getInspector(container)
    const xInput = getNumericInput(inspector, 'X')
    const widthInput = getNumericInput(inspector, 'Width')
    const initialX = Number(xInput.value)
    const initialWidth = Number(widthInput.value)
    const frame = getSelectionFrame(container)

    fireEvent.pointerDown(frame, { clientX: 101, clientY: 76, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 121, clientY: 96, buttons: 1 })

    await waitFor(() => {
      expect(Number(xInput.value)).not.toBe(initialX)
    })

    expect(Number(widthInput.value)).toBe(initialWidth)

    fireEvent.pointerUp(window)
  })

  it('selected lower-layer side handles still resize when an overlapping top layer receives the pointer event', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const inspector = getInspector(container)
    const widthInput = getNumericInput(inspector, 'Width')
    const yInput = getNumericInput(inspector, 'Y')
    const initialWidth = Number(widthInput.value)
    const initialY = Number(yInput.value)
    const canvasLayers = getCanvasLayers(container)
    const overlappingTopLayer = canvasLayers[2]

    expect(inspector.textContent).toContain('Rounded Corners')
    expect(overlappingTopLayer).not.toBeUndefined()

    fireEvent.pointerDown(overlappingTopLayer, { clientX: 173, clientY: 76, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 193, clientY: 76, buttons: 1 })

    await waitFor(() => {
      expect(Number(widthInput.value)).not.toBe(initialWidth)
    })

    expect(Number(yInput.value)).toBe(initialY)
    expect(inspector.textContent).toContain('Rounded Corners')
    expect(container.querySelector('.selection-frame.interactive')).not.toBeNull()

    fireEvent.pointerUp(window)
  })
})
