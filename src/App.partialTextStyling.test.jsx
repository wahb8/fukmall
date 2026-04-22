import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  CURRENT_DOCUMENT_STORAGE_KEY,
  parseProjectFile,
  serializeProjectFile,
} from './lib/documentFiles'
import { createDocument, createTextLayer } from './lib/layers'
import { composeTextLayerCanvases } from './lib/raster'

function getInspector(container) {
  const inspector = container.querySelector('.inspector-panel')

  expect(inspector).not.toBeNull()

  return inspector
}

function getCanvasLayers(container) {
  return Array.from(container.querySelectorAll('.canvas-layer'))
}

function getTextEditor(container) {
  const editor = container.querySelector('.text-layer-editor')

  expect(editor).not.toBeNull()

  return editor
}

function getNumericInput(inspector, labelText) {
  const label = Array.from(inspector.querySelectorAll('label')).find((candidate) => (
    candidate.querySelector('span')?.textContent === labelText
  ))

  expect(label).not.toBeNull()

  return label.querySelector('input')
}

function getColorInput(inspector) {
  return getNumericInput(inspector, 'Color')
}

function getSelectInput(inspector, labelText) {
  const label = Array.from(inspector.querySelectorAll('label')).find((candidate) => (
    candidate.querySelector('span')?.textContent === labelText
  ))

  expect(label).not.toBeNull()

  return label.querySelector('select')
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

function getPersistedDocument() {
  const persisted = window.localStorage.getItem(CURRENT_DOCUMENT_STORAGE_KEY)

  expect(persisted).toBeTruthy()

  return parseProjectFile(persisted)
}

function getPersistedSelectedTextLayer() {
  const documentState = getPersistedDocument()
  const selectedLayer = documentState.layers.find((layer) => layer.id === documentState.selectedLayerId)

  expect(selectedLayer?.type).toBe('text')

  return selectedLayer
}

async function waitForPersistedSelectedTextLayer(assertion) {
  return waitFor(() => {
    const layer = getPersistedSelectedTextLayer()

    assertion(layer)

    return layer
  })
}

async function createSelectedTextLayer(container) {
  fireEvent.click(screen.getByRole('button', { name: 'Add Text' }))

  await waitFor(() => {
    expect(getInspector(container).textContent).toContain('Font Size')
  })
}

async function enterInlineEditing(container) {
  const textLayer = getCanvasLayers(container).at(-1)

  expect(textLayer).not.toBeUndefined()

  fireEvent.doubleClick(textLayer, { clientX: 120, clientY: 70, buttons: 1 })

  await waitFor(() => {
    expect(container.querySelector('.text-layer-editor')).not.toBeNull()
  })

  return getTextEditor(container)
}

async function setEditorText(container, nextValue) {
  const editor = getTextEditor(container)

  fireEvent.change(editor, { target: { value: nextValue } })

  await waitForPersistedSelectedTextLayer((layer) => {
    expect(layer.text).toBe(nextValue)
  })

  return getTextEditor(container)
}

function selectEditorRange(editor, start, end) {
  editor.focus()
  editor.setSelectionRange(start, end)
  fireEvent.select(editor)
}

function expectRangeStyles(layer, styles) {
  expect(layer.styleRanges).toEqual([
    {
      start: 6,
      end: 11,
      styles,
    },
  ])
}

describe('App partial text styling', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const textDrawCalls = []

  beforeEach(() => {
    window.localStorage.clear()
    textDrawCalls.length = 0

    vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function mockGetContext(contextType) {
        const context = originalGetContext.call(this, contextType)

        if (contextType !== '2d' || !context) {
          return context
        }

        if (!context.__textDrawRecordingInstalled) {
          const canvas = this
          const originalFillText = typeof context.fillText === 'function'
            ? context.fillText.bind(context)
            : () => {}

          context.fillText = function recordedFillText(text, ...args) {
            textDrawCalls.push({
              text,
              font: this.font,
              fillStyle: this.fillStyle,
              canvasClass: String(canvas.className ?? ''),
            })

            return originalFillText(text, ...args)
          }

          context.__textDrawRecordingInstalled = true
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

  it('applies font family only to the selected inline-edit text range', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    let editor = await enterInlineEditing(container)
    editor = await setEditorText(container, 'Hello world')
    selectEditorRange(editor, 6, 11)

    const fontSelect = getSelectInput(getInspector(container), 'Font')
    fireEvent.pointerDown(fontSelect)
    fireEvent.change(fontSelect, { target: { value: '"Ubuntu", sans-serif' } })

    await waitForPersistedSelectedTextLayer((layer) => {
      expect(layer.fontFamily).toBe('Arial, sans-serif')
      expectRangeStyles(layer, { fontFamily: '"Ubuntu", sans-serif' })
    })

    fireEvent.keyDown(getTextEditor(container), {
      key: 'Enter',
      ctrlKey: true,
    })

    await waitFor(() => {
      expect(container.querySelector('.text-layer-editor')).toBeNull()
    })

    await waitForPersistedSelectedTextLayer((layer) => {
      expectRangeStyles(layer, { fontFamily: '"Ubuntu", sans-serif' })
    })
  })

  it('applies font size only to the selected inline-edit text range', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    let editor = await enterInlineEditing(container)
    editor = await setEditorText(container, 'Hello world')
    selectEditorRange(editor, 6, 11)

    const fontSizeInput = getNumericInput(getInspector(container), 'Font Size')
    fireEvent.pointerDown(fontSizeInput)
    fireEvent.focus(fontSizeInput)
    fireEvent.change(fontSizeInput, { target: { value: '60' } })
    fireEvent.blur(fontSizeInput)

    await waitForPersistedSelectedTextLayer((layer) => {
      expect(layer.fontSize).toBe(42)
      expectRangeStyles(layer, { fontSize: 60 })
    })
  })

  it('applies bold only to the selected inline-edit text range', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    let editor = await enterInlineEditing(container)
    editor = await setEditorText(container, 'Hello world')
    selectEditorRange(editor, 6, 11)

    const boldButton = getPropertyButton(getInspector(container), 'Weight', 'Bold')

    expect(boldButton).not.toBeUndefined()

    fireEvent.pointerDown(boldButton)
    fireEvent.click(boldButton)

    await waitForPersistedSelectedTextLayer((layer) => {
      expect(layer.fontWeight).toBe(400)
      expectRangeStyles(layer, { fontWeight: 700 })
    })
  })

  it('applies color only to the selected inline-edit text range', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    let editor = await enterInlineEditing(container)
    editor = await setEditorText(container, 'Hello world')
    selectEditorRange(editor, 6, 11)

    const colorInput = getColorInput(getInspector(container))
    fireEvent.pointerDown(colorInput)
    fireEvent.change(colorInput, { target: { value: '#ff0000' } })

    await waitForPersistedSelectedTextLayer((layer) => {
      expect(layer.color).toBe('#0f172a')
      expectRangeStyles(layer, { color: '#ff0000' })
    })
  })

  it('falls back to whole-layer styling when no text range is selected', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    let editor = await enterInlineEditing(container)
    editor = await setEditorText(container, 'Hello world')
    selectEditorRange(editor, 11, 11)

    const inspector = getInspector(container)
    const fontSelect = getSelectInput(inspector, 'Font')
    const fontSizeInput = getNumericInput(inspector, 'Font Size')
    const colorInput = getColorInput(inspector)
    const boldButton = getPropertyButton(inspector, 'Weight', 'Bold')

    expect(boldButton).not.toBeUndefined()

    fireEvent.pointerDown(fontSelect)
    fireEvent.change(fontSelect, { target: { value: '"Ubuntu", sans-serif' } })

    fireEvent.pointerDown(fontSizeInput)
    fireEvent.focus(fontSizeInput)
    fireEvent.change(fontSizeInput, { target: { value: '60' } })
    fireEvent.blur(fontSizeInput)

    fireEvent.pointerDown(boldButton)
    fireEvent.click(boldButton)

    fireEvent.pointerDown(colorInput)
    fireEvent.change(colorInput, { target: { value: '#ff0000' } })

    await waitForPersistedSelectedTextLayer((layer) => {
      expect(layer.fontFamily).toBe('"Ubuntu", sans-serif')
      expect(layer.fontSize).toBe(60)
      expect(layer.fontWeight).toBe(700)
      expect(layer.color).toBe('#ff0000')
      expect(layer.styleRanges).toEqual([])
    })
  })

  it('keeps the mixed-style preview visible immediately during edit mode', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    let editor = await enterInlineEditing(container)
    editor = await setEditorText(container, 'Hello world')
    selectEditorRange(editor, 6, 11)
    textDrawCalls.length = 0

    const colorInput = getColorInput(getInspector(container))
    fireEvent.pointerDown(colorInput)
    fireEvent.change(colorInput, { target: { value: '#ff0000' } })

    await waitFor(() => {
      expect(container.querySelector('.text-layer-editor')).not.toBeNull()
      expect(
        textDrawCalls.some((call) => (
          call.text.trim() === 'world' &&
          call.fillStyle === '#ff0000'
        )),
      ).toBe(true)
      expect(
        textDrawCalls.some((call) => (
          call.text.trim() === 'Hello' &&
          call.fillStyle === '#0f172a'
        )),
      ).toBe(true)
    })
  })

  it('preserves selected-range styling through undo and redo', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    let editor = await enterInlineEditing(container)
    editor = await setEditorText(container, 'Hello world')
    selectEditorRange(editor, 6, 11)

    const colorInput = getColorInput(getInspector(container))
    fireEvent.pointerDown(colorInput)
    fireEvent.change(colorInput, { target: { value: '#ff0000' } })

    await waitForPersistedSelectedTextLayer((layer) => {
      expectRangeStyles(layer, { color: '#ff0000' })
    })

    fireEvent.click(getUndoButton())

    await waitForPersistedSelectedTextLayer((layer) => {
      expect(layer.styleRanges).toEqual([])
    })

    fireEvent.click(getRedoButton())

    await waitForPersistedSelectedTextLayer((layer) => {
      expectRangeStyles(layer, { color: '#ff0000' })
    })
  })

  it('keeps selected-range mixed styles on the shared export text render path after inline editing', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await createSelectedTextLayer(container)
    let editor = await enterInlineEditing(container)
    editor = await setEditorText(container, 'Hello world')
    selectEditorRange(editor, 6, 11)

    const colorInput = getColorInput(getInspector(container))
    fireEvent.pointerDown(colorInput)
    fireEvent.change(colorInput, { target: { value: '#ff0000' } })

    fireEvent.keyDown(getTextEditor(container), {
      key: 'Enter',
      ctrlKey: true,
    })

    await waitFor(() => {
      expect(container.querySelector('.text-layer-editor')).toBeNull()
    })

    const selectedLayer = getPersistedSelectedTextLayer()

    textDrawCalls.length = 0
    composeTextLayerCanvases(selectedLayer)

    expect(textDrawCalls.some((call) => call.text.trim() === 'Hello' && call.fillStyle === '#0f172a')).toBe(true)
    expect(textDrawCalls.some((call) => call.text.trim() === 'world' && call.fillStyle === '#ff0000')).toBe(true)
  })

  it('retains mixed style ranges when a saved auto-fit box text layer is resized', async () => {
    const layer = createTextLayer({
      mode: 'box',
      autoFit: true,
      text: 'Hello world',
      fontSize: 64,
      boxWidth: 280,
      boxHeight: 120,
      width: 280,
      height: 120,
      styleRanges: [{ start: 6, end: 11, styles: { color: '#ff0000', fontSize: 36 } }],
    })
    const documentState = createDocument([layer], layer.id)

    window.localStorage.setItem(CURRENT_DOCUMENT_STORAGE_KEY, serializeProjectFile(documentState))

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const widthInput = getNumericInput(getInspector(container), 'Width')
    const nextWidth = Math.max(96, Number(widthInput.value) - 80)

    fireEvent.change(widthInput, { target: { value: String(nextWidth) } })
    fireEvent.blur(widthInput)

    await waitForPersistedSelectedTextLayer((selectedLayer) => {
      expect(selectedLayer.width).toBe(nextWidth)
      expect(selectedLayer.styleRanges).toHaveLength(1)
      expect(selectedLayer.styleRanges[0].start).toBe(6)
      expect(selectedLayer.styleRanges[0].end).toBe(11)
      expect(selectedLayer.styleRanges[0].styles.color).toBe('#ff0000')
      expect(Number(selectedLayer.styleRanges[0].styles.fontSize)).toBeGreaterThan(8)
    })
  })
})
