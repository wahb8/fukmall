import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  TOOL_PANEL_ERROR_DURATION_MS,
  TOOL_PANEL_ERROR_FADE_DELAY_MS,
} from './editor/constants'
import { CURRENT_DOCUMENT_STORAGE_KEY } from './lib/documentFiles'

function getToolPanelError() {
  return screen.queryByRole('status')
}

function getNewFileDialog() {
  return screen.getByRole('dialog', { name: 'New file dimensions' })
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

describe('App tool-panel error lifecycle', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const originalSetItem = Storage.prototype.setItem
  let shouldFailAutosave = false

  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    shouldFailAutosave = false

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

    vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function mockSetItem(key, value) {
        if (key === CURRENT_DOCUMENT_STORAGE_KEY && shouldFailAutosave) {
          throw new Error('Autosave failed')
        }

        return originalSetItem.call(this, key, value)
      })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    cleanup()
  })

  it('shows, fades, and removes the transient tool-panel error after the expected timing', async () => {
    shouldFailAutosave = true

    render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    const initialError = screen.getByRole('status')
    expect(initialError).toHaveTextContent('Current document could not be autosaved locally.')
    expect(initialError).toHaveClass('visible')
    expect(initialError).not.toHaveClass('fading')

    await act(async () => {
      vi.advanceTimersByTime(TOOL_PANEL_ERROR_FADE_DELAY_MS + 1)
    })

    const fadingError = screen.getByRole('status')
    expect(fadingError).toHaveClass('fading')
    expect(fadingError).not.toHaveClass('visible')

    await act(async () => {
      vi.advanceTimersByTime(TOOL_PANEL_ERROR_DURATION_MS - TOOL_PANEL_ERROR_FADE_DELAY_MS)
    })

    expect(getToolPanelError()).toBeNull()
  })

  it('dismisses the transient tool-panel error immediately when the close button is clicked', async () => {
    shouldFailAutosave = true

    render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Current document could not be autosaved locally.')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss status message' }))

    expect(getToolPanelError()).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(TOOL_PANEL_ERROR_DURATION_MS + 10)
    })

    expect(getToolPanelError()).toBeNull()
  })

  it('restarts the timer cleanly when a new tool-panel error appears during fade-out', async () => {
    shouldFailAutosave = true

    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(TOOL_PANEL_ERROR_FADE_DELAY_MS + 1)
    })

    expect(screen.getByRole('status')).toHaveClass('fading')

    shouldFailAutosave = false

    const inspector = getInspector(container)
    fireEvent.change(getNumericInput(inspector, 'Opacity'), { target: { value: '0.9' } })
    expect(Number(getNumericInput(getInspector(container), 'Opacity').value)).toBe(0.9)

    shouldFailAutosave = true
    fireEvent.change(getNumericInput(getInspector(container), 'Opacity'), { target: { value: '0.8' } })
    expect(screen.getByRole('status')).toHaveClass('visible')
    expect(screen.getByRole('status')).not.toHaveClass('fading')

    await act(async () => {
      vi.advanceTimersByTime(TOOL_PANEL_ERROR_FADE_DELAY_MS + 1)
    })

    expect(screen.getByRole('status')).toHaveClass('fading')

    await act(async () => {
      vi.advanceTimersByTime(TOOL_PANEL_ERROR_DURATION_MS - TOOL_PANEL_ERROR_FADE_DELAY_MS)
    })

    expect(getToolPanelError()).toBeNull()
  })

  it('shows a new tool-panel error normally after the previous one was manually dismissed', async () => {
    shouldFailAutosave = true

    const { container } = render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss status message' }))
    expect(getToolPanelError()).toBeNull()

    shouldFailAutosave = false
    const inspector = getInspector(container)
    fireEvent.change(getNumericInput(inspector, 'Opacity'), { target: { value: '0.9' } })

    shouldFailAutosave = true
    fireEvent.change(getNumericInput(getInspector(container), 'Opacity'), { target: { value: '0.8' } })

    expect(screen.getByRole('status')).toHaveClass('visible')
    expect(screen.getByRole('button', { name: 'Dismiss status message' })).toBeInTheDocument()
  })

  it('clears the transient tool-panel error when a new file resets runtime state', async () => {
    shouldFailAutosave = true

    render(
      <StrictMode>
        <App editorChromeEnabled />
      </StrictMode>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Current document could not be autosaved locally.')

    fireEvent.click(screen.getByRole('button', { name: 'Pen' }))
    expect(screen.getByRole('button', { name: 'Pen' })).toHaveClass('active')

    shouldFailAutosave = false

    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New File' }))

    const dialog = getNewFileDialog()
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Reset Runtime State' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(screen.queryByRole('dialog', { name: 'New file dimensions' })).toBeNull()
    expect(getToolPanelError()).toBeNull()
    expect(screen.getByRole('button', { name: 'Select' })).toHaveClass('active')
  })
})
