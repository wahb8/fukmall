import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppRoot from './AppRoot'

function setPathname(pathname) {
  window.history.pushState({}, '', pathname)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

describe('AppRoot routing', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const originalPathname = window.location.pathname

  beforeEach(() => {
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
  })

  afterEach(() => {
    setPathname(originalPathname)
    vi.restoreAllMocks()
    cleanup()
  })

  it('renders the themed landing page at /', () => {
    setPathname('/')

    const { container } = render(
      <StrictMode>
        <AppRoot />
      </StrictMode>,
    )

    expect(container.querySelector('.landing-shell')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Kryopic home' })).toBeInTheDocument()
    expect(screen.getByText('Kryopic')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Start with clarity.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Preview' })).toBeInTheDocument()
  })

  it('navigates to the editor when Get started is clicked', async () => {
    setPathname('/')

    const { container } = render(
      <StrictMode>
        <AppRoot />
      </StrictMode>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/app')
      expect(container.querySelector('.app-shell')).not.toBeNull()
      expect(container.textContent).toContain('Create Layer')
    })
  })

  it('renders the editor at /app', async () => {
    setPathname('/app')

    const { container } = render(
      <StrictMode>
        <AppRoot />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(container.querySelector('.app-shell')).not.toBeNull()
      expect(container.textContent).toContain('Create Layer')
    })
  })
})
