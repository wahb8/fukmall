import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function getPropertyButton(inspector, labelText, buttonText) {
  const label = Array.from(inspector.querySelectorAll('label')).find((candidate) => (
    candidate.querySelector('span')?.textContent === labelText
  ))

  expect(label).not.toBeNull()

  return Array.from(label.querySelectorAll('button')).find((candidate) => (
    candidate.textContent?.trim() === buttonText
  ))
}

function getUndoButton() {
  return screen.getByRole('button', { name: 'Undo' })
}

function getRedoButton() {
  return screen.getByRole('button', { name: 'Redo' })
}

async function createSelectedTextLayer(container) {
  fireEvent.click(screen.getByRole('button', { name: 'Add Text' }))

  await waitFor(() => {
    expect(getInspector(container).textContent).toContain('Font Size')
  })
}

describe('App inspector history coalescing', () => {
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

  it('coalesces repeated opacity changes into one undo/redo step', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    const inspector = getInspector(container)
    const opacityInput = getNumericInput(inspector, 'Opacity')

    expect(Number(opacityInput.value)).toBe(1)

    fireEvent.change(opacityInput, { target: { value: '0.9' } })
    fireEvent.change(opacityInput, { target: { value: '0.8' } })
    fireEvent.change(opacityInput, { target: { value: '0.7' } })

    await waitFor(() => {
      expect(Number(opacityInput.value)).toBe(0.7)
    })

    fireEvent.click(getUndoButton())

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Opacity').value)).toBe(1)
    })

    fireEvent.click(getRedoButton())

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Opacity').value)).toBe(0.7)
    })
  })

  it('starts a new history step when a different property is adjusted', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    const inspector = getInspector(container)
    const opacityInput = getNumericInput(inspector, 'Opacity')
    const widthInput = getNumericInput(inspector, 'Width')
    const initialWidth = Number(widthInput.value)

    fireEvent.change(opacityInput, { target: { value: '0.8' } })
    fireEvent.change(widthInput, { target: { value: String(initialWidth + 40) } })
    fireEvent.blur(widthInput)

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Opacity').value)).toBe(0.8)
      expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBe(initialWidth + 40)
    })

    fireEvent.click(getUndoButton())

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBe(initialWidth)
      expect(Number(getNumericInput(getInspector(container), 'Opacity').value)).toBe(0.8)
    })

    fireEvent.click(getUndoButton())

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Opacity').value)).toBe(1)
    })
  })

  it('starts a new history step when a different layer is adjusted', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Text' }))

    const layerRows = Array.from(container.querySelectorAll('.layer-row'))
    const initiallySelectedRow = container.querySelector('.layer-row.selected')
    const secondRow = layerRows.find((row) => row !== initiallySelectedRow)

    expect(initiallySelectedRow).not.toBeNull()
    expect(secondRow).not.toBeUndefined()

    fireEvent.change(getNumericInput(getInspector(container), 'Opacity'), {
      target: { value: '0.8' },
    })

    fireEvent.click(secondRow)

    await waitFor(() => {
      expect(secondRow.className).toContain('selected')
    })

    const secondInspector = getInspector(container)
    const secondLayerOpacityInput = getNumericInput(secondInspector, 'Opacity')
    const secondLayerInitialOpacity = Number(secondLayerOpacityInput.value)

    fireEvent.change(secondLayerOpacityInput, { target: { value: '0.6' } })
    fireEvent.blur(secondLayerOpacityInput)

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Opacity').value)).toBe(0.6)
    })

    fireEvent.click(getUndoButton())

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Opacity').value)).toBe(secondLayerInitialOpacity)
    })

    fireEvent.click(initiallySelectedRow)

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Opacity').value)).toBe(0.8)
    })
  })

  it('does not create a redundant history entry for a no-op adjustment burst', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    const opacityInput = getNumericInput(getInspector(container), 'Opacity')

    fireEvent.change(opacityInput, { target: { value: '0.8' } })
    fireEvent.change(opacityInput, { target: { value: '1' } })
    fireEvent.blur(opacityInput)

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Opacity').value)).toBe(1)
    })

    fireEvent.click(getUndoButton())

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Opacity').value)).toBe(1)
    })

    expect(getRedoButton()).toBeDisabled()
  })

  it('keeps text resize auto-fit as one coherent undoable adjustment', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)

    const inspector = getInspector(container)
    const widthInput = getNumericInput(inspector, 'Width')
    const fontSizeInput = getNumericInput(inspector, 'Font Size')
    const initialWidth = Number(widthInput.value)
    const initialFontSize = Number(fontSizeInput.value)
    const nextWidth = Math.max(72, initialWidth - 120)

    fireEvent.change(widthInput, { target: { value: String(nextWidth) } })
    fireEvent.blur(widthInput)

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBe(nextWidth)
    })

    const fittedFontSize = Number(getNumericInput(getInspector(container), 'Font Size').value)

    expect(fittedFontSize).toBeLessThan(initialFontSize)

    fireEvent.click(getUndoButton())

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBe(initialWidth)
      expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBe(initialFontSize)
    })

    fireEvent.click(getRedoButton())

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Width').value)).toBe(nextWidth)
      expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBe(fittedFontSize)
    })
  })

  it('lets the full-layer font size control override auto-fit after a text resize', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)

    const inspector = getInspector(container)
    const widthInput = getNumericInput(inspector, 'Width')
    const narrowedWidth = Math.max(72, Number(widthInput.value) - 120)

    fireEvent.change(widthInput, { target: { value: String(narrowedWidth) } })
    fireEvent.blur(widthInput)

    const fittedFontSize = await waitFor(() => {
      const nextValue = Number(getNumericInput(getInspector(container), 'Font Size').value)
      expect(nextValue).toBeGreaterThan(0)
      return nextValue
    })

    expect(fittedFontSize).toBeGreaterThan(24)

    fireEvent.focus(getNumericInput(getInspector(container), 'Font Size'))
    fireEvent.change(getNumericInput(getInspector(container), 'Font Size'), {
      target: { value: '24' },
    })
    fireEvent.blur(getNumericInput(getInspector(container), 'Font Size'))

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBe(24)
    })
  })

  it('keeps auto-fit font size stable when bold is toggled and preserves undo/redo', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)

    const widthInput = getNumericInput(getInspector(container), 'Width')
    const narrowedWidth = Math.max(72, Number(widthInput.value) - 120)

    fireEvent.change(widthInput, { target: { value: String(narrowedWidth) } })
    fireEvent.blur(widthInput)

    const fittedFontSize = await waitFor(() => {
      const nextValue = Number(getNumericInput(getInspector(container), 'Font Size').value)
      expect(nextValue).toBeGreaterThan(8)
      return nextValue
    })
    const boldButton = getPropertyButton(getInspector(container), 'Weight', 'Bold')

    expect(boldButton).not.toBeUndefined()

    fireEvent.click(boldButton)

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBe(fittedFontSize)
    })

    fireEvent.click(getUndoButton())

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBe(fittedFontSize)
    })

    fireEvent.click(getRedoButton())

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBe(fittedFontSize)
    })
  })

  it('clamps oversized inspector font size input and stops the stepper at the max', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)

    const fontSizeInput = getNumericInput(getInspector(container), 'Font Size')
    fireEvent.focus(fontSizeInput)
    fireEvent.change(fontSizeInput, { target: { value: '4000' } })
    fireEvent.blur(fontSizeInput)

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBe(1000)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Increase font size' }))

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Font Size').value)).toBe(1000)
    })
  })

  it('clamps oversized inspector letter spacing and line height input values', async () => {
    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)

    fireEvent.change(getNumericInput(getInspector(container), 'Letter Spacing'), {
      target: { value: '80' },
    })
    fireEvent.blur(getNumericInput(getInspector(container), 'Letter Spacing'))

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Letter Spacing').value)).toBe(50)
    })

    fireEvent.change(getNumericInput(getInspector(container), 'Line Height'), {
      target: { value: '10' },
    })
    fireEvent.blur(getNumericInput(getInspector(container), 'Line Height'))

    await waitFor(() => {
      expect(Number(getNumericInput(getInspector(container), 'Line Height').value)).toBe(3)
    })
  })
})
