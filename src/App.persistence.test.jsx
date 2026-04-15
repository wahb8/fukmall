import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  CURRENT_DOCUMENT_STORAGE_KEY,
  serializeProjectFile,
} from './lib/documentFiles'

function getInspector(container) {
  const inspector = container.querySelector('.inspector-panel')

  expect(inspector).not.toBeNull()

  return inspector
}

function getNewFileDialog() {
  return screen.getByRole('dialog', { name: 'New file dimensions' })
}

describe('App current document persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('restores the previously persisted current document on startup', async () => {
    window.localStorage.setItem(CURRENT_DOCUMENT_STORAGE_KEY, JSON.stringify({
      app: 'Fukmall',
      version: 2,
      document: {
        name: 'Restored Document',
        width: 1200,
        height: 1600,
        layers: [
          {
            id: 'bg-layer',
            name: 'Restored Background',
            type: 'shape',
            visible: true,
            opacity: 1,
            x: 600,
            y: 800,
            width: 1200,
            height: 1600,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            linkedLayerId: null,
            lockTransparentPixels: false,
            fill: '#abcdef',
            radius: 0,
          },
        ],
        selectedLayerId: 'bg-layer',
        selectedLayerIds: ['bg-layer'],
      },
    }))

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const inspector = getInspector(container)

    await waitFor(() => {
      expect(within(inspector).getByLabelText('Width')).toHaveValue(1200)
      expect(within(inspector).getByLabelText('Height')).toHaveValue(1600)
    })

    expect(screen.queryByText('A cleaner layer stack')).toBeNull()
    expect(window.localStorage.getItem(CURRENT_DOCUMENT_STORAGE_KEY)).toContain('Restored Document')
  })

  it('creating a new file updates the persisted current document', async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New File' }))

    const dialog = getNewFileDialog()
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Reload Me' },
    })
    fireEvent.change(within(dialog).getByLabelText('Width'), {
      target: { value: '777' },
    })
    fireEvent.change(within(dialog).getByLabelText('Height'), {
      target: { value: '999' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      const persisted = window.localStorage.getItem(CURRENT_DOCUMENT_STORAGE_KEY)

      expect(persisted).toContain('Reload Me')
      expect(persisted).toContain('"width":777')
      expect(persisted).toContain('"height":999')
    })
  })

  it('opening a file updates the persisted current document', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const fileInput = container.querySelector('input[type="file"][accept=".kryop,application/json"]')
    const file = new File([
      serializeProjectFile({
        name: 'Opened Persisted File',
        width: 640,
        height: 480,
        layers: [
          {
            id: 'opened-layer',
            name: 'Opened Layer',
            type: 'shape',
            visible: true,
            opacity: 1,
            x: 320,
            y: 240,
            width: 640,
            height: 480,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            linkedLayerId: null,
            lockTransparentPixels: false,
            fill: '#ffffff',
            radius: 0,
          },
        ],
        selectedLayerId: 'opened-layer',
        selectedLayerIds: ['opened-layer'],
      }),
    ], 'opened.kryop', { type: 'application/json' })

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    })

    await waitFor(() => {
      const persisted = window.localStorage.getItem(CURRENT_DOCUMENT_STORAGE_KEY)

      expect(persisted).toContain('Opened Persisted File')
      expect(persisted).toContain('"width":640')
      expect(persisted).toContain('"height":480')
    })
  })

  it('invalid persisted data falls back to the default seeded document', async () => {
    window.localStorage.setItem(CURRENT_DOCUMENT_STORAGE_KEY, 'not valid json')

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const inspector = getInspector(container)

    await waitFor(() => {
      expect(within(inspector).getByLabelText('Width')).toHaveValue(360)
      expect(within(inspector).getByLabelText('Height')).toHaveValue(260)
    })

    expect(window.localStorage.getItem(CURRENT_DOCUMENT_STORAGE_KEY)).toContain('Hero Image')
  })
})
