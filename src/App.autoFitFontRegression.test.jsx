import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const PRIMARY_FONT_CASES = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Cairo', value: '"Cairo", sans-serif' },
]

const ADDITIONAL_FONT_CASES = [
  { label: 'Ubuntu', value: '"Ubuntu", sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
]

const BASE_TEXT_SPEC = {
  text: 'A much longer headline that needs fitting',
  color: '#123456',
  bolded: true,
  size: 88,
  alignment: 'center',
  x: 220,
  y: 220,
  width: 220,
  height: 90,
  addShadow: false,
  layerPlacement: 0,
}

function createAutoFitJsonPayload(fontCase) {
  return JSON.stringify({
    texts: [
      {
        ...BASE_TEXT_SPEC,
        'Layer name': `${fontCase.label} Auto Fit Runtime Title`,
        font: fontCase.value,
      },
    ],
  })
}

function getFontMetrics(fontDescriptor) {
  const normalizedFont = String(fontDescriptor ?? '').toLowerCase()

  if (normalizedFont.includes('arial')) {
    return {
      widthFactor: 0.62,
      ascentFactor: 0.78,
      descentFactor: 0.22,
      overflowFactor: 0.18,
    }
  }

  if (normalizedFont.includes('cairo')) {
    return {
      widthFactor: 0.54,
      ascentFactor: 0.84,
      descentFactor: 0.24,
      overflowFactor: 0.05,
    }
  }

  if (normalizedFont.includes('ubuntu')) {
    return {
      widthFactor: 0.58,
      ascentFactor: 0.8,
      descentFactor: 0.22,
      overflowFactor: 0.08,
    }
  }

  if (normalizedFont.includes('georgia')) {
    return {
      widthFactor: 0.6,
      ascentFactor: 0.81,
      descentFactor: 0.23,
      overflowFactor: 0.1,
    }
  }

  return {
    widthFactor: 0.59,
    ascentFactor: 0.8,
    descentFactor: 0.22,
    overflowFactor: 0.09,
  }
}

function createFontSensitiveMeasureText(font) {
  const fontMatch = String(font ?? '').match(/(\d+(?:\.\d+)?)px\s+(.+)$/)
  const fontSize = fontMatch ? Number(fontMatch[1]) : 16
  const fontDescriptor = fontMatch?.[2] ?? ''
  const metrics = getFontMetrics(fontDescriptor)

  return (text) => {
    const glyphCount = Array.from(String(text ?? '')).length
    const width = glyphCount * Math.max(fontSize * metrics.widthFactor, 1)
    const overflow = glyphCount > 0 ? fontSize * metrics.overflowFactor : 0

    return {
      width,
      actualBoundingBoxAscent: fontSize * metrics.ascentFactor,
      actualBoundingBoxDescent: fontSize * metrics.descentFactor,
      actualBoundingBoxLeft: overflow,
      actualBoundingBoxRight: width + overflow,
    }
  }
}

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

async function createSelectedJsonAutoFitTextLayer(container, fontCase) {
  fireEvent.change(screen.getAllByLabelText('JSON')[0], {
    target: { value: createAutoFitJsonPayload(fontCase) },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create From JSON' }))

  await waitFor(() => {
    const inspector = getInspector(container)

    expect(inspector.textContent).toContain('Font Size')
    expect(Number(getNumericInput(inspector, 'Width').value)).toBe(220)
    expect(Number(getNumericInput(inspector, 'Height').value)).toBe(90)
    expect(Number(getNumericInput(inspector, 'Font Size').value)).toBeGreaterThan(8)
  })
}

function getInspectorMetrics(container) {
  const inspector = getInspector(container)

  return {
    width: Number(getNumericInput(inspector, 'Width').value),
    height: Number(getNumericInput(inspector, 'Height').value),
    fontSize: Number(getNumericInput(inspector, 'Font Size').value),
  }
}

async function resizeDownThenBackUp(container) {
  const handle = getHandle(container, 'se')
  const initial = getInspectorMetrics(container)

  fireEvent.pointerDown(handle, { clientX: 173, clientY: 128, buttons: 1 })
  fireEvent.pointerMove(window, { clientX: 236, clientY: 176, buttons: 1 })

  const grown = await waitFor(() => {
    const nextMetrics = getInspectorMetrics(container)

    expect(nextMetrics.width).toBeGreaterThan(initial.width)
    expect(nextMetrics.height).toBeGreaterThan(initial.height)
    expect(nextMetrics.fontSize).toBeGreaterThan(initial.fontSize)

    return nextMetrics
  })

  fireEvent.pointerUp(window)

  await waitFor(() => {
    expect(getInspectorMetrics(container)).toEqual(grown)
  })

  fireEvent.pointerDown(handle, { clientX: 236, clientY: 176, buttons: 1 })
  fireEvent.pointerMove(window, { clientX: 224, clientY: 166, buttons: 1 })

  const shrunk = await waitFor(() => {
    const nextMetrics = getInspectorMetrics(container)

    expect(nextMetrics.width).toBeLessThan(grown.width)
    expect(nextMetrics.height).toBeLessThan(grown.height)
    expect(nextMetrics.fontSize).toBeLessThanOrEqual(grown.fontSize)
    expect(nextMetrics.fontSize).toBeGreaterThan(8)

    return nextMetrics
  })

  const shrunkFrame = getSelectionFrame(container)

  expect(Number.parseFloat(shrunkFrame.style.width)).toBeCloseTo(shrunk.width)
  expect(Number.parseFloat(shrunkFrame.style.height)).toBeCloseTo(shrunk.height)

  fireEvent.pointerUp(window)

  await waitFor(() => {
    expect(getInspectorMetrics(container)).toEqual(shrunk)
  })

  fireEvent.pointerDown(handle, { clientX: 224, clientY: 166, buttons: 1 })
  fireEvent.pointerMove(window, { clientX: 244, clientY: 184, buttons: 1 })

  const regrown = await waitFor(() => {
    const nextMetrics = getInspectorMetrics(container)

    expect(nextMetrics.width).toBeGreaterThan(shrunk.width)
    expect(nextMetrics.height).toBeGreaterThan(shrunk.height)
    expect(nextMetrics.fontSize).toBeGreaterThan(shrunk.fontSize)

    return nextMetrics
  })

  const regrownFrame = getSelectionFrame(container)

  expect(Number.parseFloat(regrownFrame.style.width)).toBeCloseTo(regrown.width)
  expect(Number.parseFloat(regrownFrame.style.height)).toBeCloseTo(regrown.height)

  fireEvent.pointerUp(window)

  await waitFor(() => {
    expect(getInspectorMetrics(container)).toEqual(regrown)
  })

  return {
    initial,
    grown,
    shrunk,
    regrown,
  }
}

describe('App auto-fit font-specific regression coverage', () => {
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
          measureText(text) {
            return createFontSensitiveMeasureText(this.font)(text)
          },
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

  it.each(PRIMARY_FONT_CASES)(
    'creates correct initial auto-fit bounds and render state for $label',
    async (fontCase) => {
      const { container } = render(
        <StrictMode>
          <App />
        </StrictMode>,
      )

      await createSelectedJsonAutoFitTextLayer(container, fontCase)

      const metrics = getInspectorMetrics(container)
      const frame = getSelectionFrame(container)

      expect(metrics.width).toBe(220)
      expect(metrics.height).toBe(90)
      expect(metrics.fontSize).toBeGreaterThan(8)
      expect(Number.parseFloat(frame.style.width)).toBeCloseTo(220)
      expect(Number.parseFloat(frame.style.height)).toBeCloseTo(90)
      expect(container.querySelector('.canvas-layer .text-layer-canvas')).not.toBeNull()
    },
  )

  it.each(PRIMARY_FONT_CASES)(
    'keeps slight shrink and later regrow stable for $label',
    async (fontCase) => {
      const { container } = render(
        <StrictMode>
          <App />
        </StrictMode>,
      )

      await createSelectedJsonAutoFitTextLayer(container, fontCase)

      const result = await resizeDownThenBackUp(container)

      expect(result.shrunk.fontSize).toBeGreaterThan(8)
      expect(result.regrown.fontSize).toBeGreaterThan(result.shrunk.fontSize)
    },
  )

  it('keeps both Arial and Cairo above 8 on a slight shrink when the box still has room', async () => {
    const results = []

    for (const fontCase of PRIMARY_FONT_CASES) {
      const { container, unmount } = render(
        <StrictMode>
          <App />
        </StrictMode>,
      )

      await createSelectedJsonAutoFitTextLayer(container, fontCase)
      const { shrunk } = await resizeDownThenBackUp(container)

      results.push({
        label: fontCase.label,
        shrunkFontSize: shrunk.fontSize,
      })

      unmount()
      cleanup()
    }

    for (const result of results) {
      expect(result.shrunkFontSize).toBeGreaterThan(8)
    }
  })

  it.each(ADDITIONAL_FONT_CASES)(
    'keeps the same shrink and regrow flow stable for additional font $label',
    async (fontCase) => {
      const { container } = render(
        <StrictMode>
          <App />
        </StrictMode>,
      )

      await createSelectedJsonAutoFitTextLayer(container, fontCase)

      const result = await resizeDownThenBackUp(container)

      expect(result.shrunk.fontSize).toBeGreaterThan(8)
      expect(result.regrown.fontSize).toBeGreaterThan(result.shrunk.fontSize)
    },
  )
})
