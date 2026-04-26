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

function getLayerRowByName(container, layerName) {
  const row = Array.from(container.querySelectorAll('.layer-row')).find((candidate) => (
    candidate.querySelector('.layer-name-input')?.value === layerName
  ))

  expect(row).not.toBeUndefined()

  return row
}

async function createSelectedTextLayer(container) {
  fireEvent.click(screen.getByRole('button', { name: 'Add Text' }))

  await waitFor(() => {
    expect(getInspector(container).textContent).toContain('Font Size')
  })

  return getLayerRowByName(container, 'New Text')
}

function getPersistedDocument() {
  return JSON.parse(window.localStorage.getItem(CURRENT_DOCUMENT_STORAGE_KEY)).document
}

describe('App layer flip controls', () => {
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

  it('flips the selected image layer horizontally and supports undo/redo', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    const inspector = getInspector(container)
    const xInput = getNumericInput(inspector, 'X')
    const yInput = getNumericInput(inspector, 'Y')
    const initialX = Number(xInput.value)
    const initialY = Number(yInput.value)
    const selectedLayerId = getPersistedDocument().selectedLayerId

    expect(inspector.textContent).not.toContain('Scale X')
    expect(inspector.textContent).not.toContain('Scale Y')
    expect(getPersistedDocument().layers.find((layer) => layer.id === selectedLayerId)?.scaleX).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Flip Horizontal' }))

    await waitFor(() => {
      expect(getPersistedDocument().layers.find((layer) => layer.id === selectedLayerId)?.scaleX).toBe(-1)
    })

    expect(Number(getNumericInput(getInspector(container), 'X').value)).toBe(initialX)
    expect(Number(getNumericInput(getInspector(container), 'Y').value)).toBe(initialY)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() => {
      expect(getPersistedDocument().layers.find((layer) => layer.id === selectedLayerId)?.scaleX).toBe(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))

    await waitFor(() => {
      expect(getPersistedDocument().layers.find((layer) => layer.id === selectedLayerId)?.scaleX).toBe(-1)
    })
  })

  it('flips the selected text layer vertically without leaving the text inspector flow', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    const selectedLayerId = getPersistedDocument().selectedLayerId

    fireEvent.click(screen.getByRole('button', { name: 'Flip Vertical' }))

    await waitFor(() => {
      expect(getPersistedDocument().layers.find((layer) => layer.id === selectedLayerId)?.scaleY).toBe(-1)
    })

    expect(getInspector(container).textContent).toContain('Font Size')
    expect(getInspector(container).textContent).not.toContain('Scale X')
    expect(getInspector(container).textContent).not.toContain('Scale Y')
    expect(screen.getByRole('button', { name: 'Flip Horizontal' })).toBeInTheDocument()
  })
})
