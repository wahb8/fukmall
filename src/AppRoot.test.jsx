import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppRoot from './AppRoot'
import { AuthContext } from './auth/authContext'

function setPathname(pathname) {
  window.history.pushState({}, '', pathname)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function createAuthValue(overrides = {}) {
  const baseValue = {
    status: 'ready',
    isLoading: false,
    isConfigured: true,
    isAuthenticated: false,
    user: null,
    session: null,
    isPasswordRecovery: false,
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithGoogle: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    updatePassword: vi.fn(),
    signOut: vi.fn(),
    clearPasswordRecovery: vi.fn(),
  }

  return {
    ...baseValue,
    ...overrides,
  }
}

function renderWithAuth(authOverrides = {}) {
  return render(
    <StrictMode>
      <AuthContext.Provider value={createAuthValue(authOverrides)}>
        <AppRoot />
      </AuthContext.Provider>
    </StrictMode>,
  )
}

describe('AppRoot routing', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const originalPathname = window.location.pathname

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
  })

  afterEach(() => {
    setPathname(originalPathname)
    vi.restoreAllMocks()
    cleanup()
  })

  it('renders the themed landing page at /', () => {
    setPathname('/')

    const { container } = renderWithAuth()

    expect(container.querySelector('.landing-shell')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Kryopic home' })).toBeInTheDocument()
    expect(screen.getByText('Kryopic')).toBeInTheDocument()
    expect(screen.getByRole('heading', {
      name: 'Create your entire week\'s posts in one sitting.',
    })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pricing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Preview' })).toBeInTheDocument()
  })

  it('navigates to the pricing page and back home from the landing page', async () => {
    setPathname('/')

    const { container } = renderWithAuth()

    fireEvent.click(screen.getByRole('button', { name: 'Pricing' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/pricing')
    })

    expect(screen.getByRole('heading', { name: 'Three tiers, one calm workflow.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Business' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Enterprise' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Get Started' })).toHaveLength(4)
    expect(screen.getByLabelText('Free price')).toHaveTextContent('0 KWD / month')
    expect(screen.getByLabelText('Business price')).toHaveTextContent('29 KWD / month')
    expect(screen.getByLabelText('Enterprise price')).toHaveTextContent('49 KWD / month')

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(window.location.pathname).toBe('/pricing')
    expect(screen.getByRole('dialog', { name: 'Sign up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()

    fireEvent.pointerDown(container.querySelector('.auth-modal-backdrop'))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Sign up' })).toBeNull()
    })

    fireEvent.click(screen.getByRole('link', { name: 'Kryopic home' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/')
      expect(screen.getByRole('heading', {
        name: 'Create your entire week\'s posts in one sitting.',
      })).toBeInTheDocument()
    })
  })

  it('opens auth popups from Log in and Sign up without leaving the landing page', async () => {
    setPathname('/')

    const { container } = renderWithAuth()

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('dialog', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Log in' })).toHaveLength(2)

    fireEvent.pointerDown(container.querySelector('.auth-modal-backdrop'))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Log in' })).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('dialog', { name: 'Sign up' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('navigates to the editor when Get started is clicked', async () => {
    setPathname('/')

    const { container } = renderWithAuth({
      isAuthenticated: true,
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/app')
      expect(container.querySelector('.app-shell')).not.toBeNull()
      expect(container.querySelector('.post-sidebar')).not.toBeNull()
      expect(container.querySelector('.canvas-panel')).not.toBeNull()
      expect(container.querySelector('.canvas-composer-shell')).not.toBeNull()
      expect(container.querySelector('.canvas-stage')).not.toBeNull()
      expect(container.querySelector('.canvas-caption-area')).not.toBeNull()
      expect(container.querySelector('.chat-timeline-panel')).not.toBeNull()
      expect(container.querySelector('.canvas-slide-panel-right')).not.toBeNull()
      expect(container.querySelector('.canvas-slide-panel-bottom')).not.toBeNull()
      expect(container.querySelector('.canvas-prompt-input')).not.toBeNull()
      expect(container.textContent).not.toContain('Create Layer')
      expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    })
  })

  it('navigates authenticated users from pricing to the editor when Get Started is clicked', async () => {
    setPathname('/pricing')

    const { container } = renderWithAuth({
      isAuthenticated: true,
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Get Started' })[0])

    await waitFor(() => {
      expect(window.location.pathname).toBe('/app')
      expect(container.querySelector('.app-shell')).not.toBeNull()
      expect(container.querySelector('.post-sidebar')).not.toBeNull()
      expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    })
  })

  it('opens sign up from pricing when an unauthenticated user clicks Get Started', async () => {
    setPathname('/pricing')

    renderWithAuth()

    fireEvent.click(screen.getAllByRole('button', { name: 'Get Started' })[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Sign up' })).toBeInTheDocument()
    })

    expect(window.location.pathname).toBe('/pricing')
  })

  it('redirects unauthenticated users away from /app and opens the login modal', async () => {
    setPathname('/app')

    renderWithAuth()

    await waitFor(() => {
      expect(window.location.pathname).toBe('/')
      expect(screen.getByRole('dialog', { name: 'Log in' })).toBeInTheDocument()
    })

    expect(window.location.search).toContain('auth=login')
  })

  it('blocks /auth/reset when there is no recovery session', () => {
    setPathname('/auth/reset')

    renderWithAuth({
      isAuthenticated: true,
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
      isPasswordRecovery: false,
    })

    expect(screen.getByRole('heading', { name: 'Reset link unavailable' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update password' })).toBeNull()
  })

  it('renders the password reset form only for recovery sessions', () => {
    setPathname('/auth/reset')

    renderWithAuth({
      isAuthenticated: true,
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
      isPasswordRecovery: true,
    })

    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update password' })).toBeInTheDocument()
  })

  it('renders the editor at /app for authenticated users', async () => {
    setPathname('/app')

    const { container } = renderWithAuth({
      isAuthenticated: true,
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.app-shell')).not.toBeNull()
      expect(container.querySelector('.post-sidebar')).not.toBeNull()
      expect(container.querySelector('.canvas-panel')).not.toBeNull()
      expect(container.querySelector('.canvas-composer-shell')).not.toBeNull()
      expect(container.querySelector('.canvas-stage')).not.toBeNull()
      expect(container.querySelector('.canvas-caption-area')).not.toBeNull()
      expect(container.querySelector('.canvas-slide-panel-right')).not.toBeNull()
      expect(container.querySelector('.canvas-slide-panel-bottom')).not.toBeNull()
      expect(container.querySelector('.canvas-prompt-input')).not.toBeNull()
      expect(container.textContent).not.toContain('Create Layer')
    })

    expect(screen.getByPlaceholderText('Describe what you want to create...')).toBeInTheDocument()
    expect(screen.queryByText('Add a caption...')).toBeNull()
    expect(container.querySelector('.canvas-caption-lines')).toBeNull()
    expect(container.querySelector('.chat-timeline-panel')).not.toBeNull()
    expect(screen.getByRole('complementary', { name: 'Canvas side tools' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Canvas download tools' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tune' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PNG' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JPG' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Post' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Kryopic home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Post' })).toBeInTheDocument()
    expect(screen.getByText('No chats yet. Start with a new post or send a prompt.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New Post' }))
    expect(screen.getByRole('dialog', { name: 'New file dimensions' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    expect(screen.getByRole('menuitem', { name: 'New File' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open File' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Save File' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Export PNG' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Export JPEG' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(container.querySelector('.editor-topbar')).toBeNull()
    expect(container.querySelector('.asset-sidebar')).toBeNull()
    expect(container.querySelector('.sidebar')).toBeNull()
    expect(container.querySelector('input[type="file"][accept=".kryop,application/json"]')).not.toBeNull()
    expect(container.querySelector('input[type="file"][accept="image/*"][multiple]')).not.toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Kryopic home' }))
    await waitFor(() => {
      expect(window.location.pathname).toBe('/')
      expect(container.querySelector('.landing-shell')).not.toBeNull()
    })
  })

  it('updates the visible stage metrics when document dimensions change', async () => {
    setPathname('/app')

    const { container } = renderWithAuth({
      isAuthenticated: true,
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.workspace-main-column')).not.toBeNull()
    })

    const getStageLayoutValue = (propertyName) => (
      container
        .querySelector('.workspace-main-column')
        ?.style
        .getPropertyValue(propertyName)
    )

    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New File' }))
    fireEvent.click(screen.getByRole('button', { name: 'Square 1:1 1080 x 1080' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(getStageLayoutValue('--stage-display-width')).toBe('428px')
      expect(getStageLayoutValue('--stage-display-height')).toBe('428px')
    })

    const projectFileContents = JSON.stringify({
      app: 'Fukmall',
      version: 2,
      document: {
        name: 'Wide',
        width: 1600,
        height: 900,
        layers: [],
        selectedLayerId: null,
        selectedLayerIds: [],
      },
    })
    const projectFile = new File([projectFileContents], 'wide.kryop', { type: 'application/json' })

    Object.defineProperty(projectFile, 'text', {
      value: vi.fn().mockResolvedValue(projectFileContents),
    })

    fireEvent.change(
      container.querySelector('input[type="file"][accept=".kryop,application/json"]'),
      { target: { files: [projectFile] } },
    )

    await waitFor(() => {
      expect(getStageLayoutValue('--stage-display-width')).toBe('428px')
      expect(getStageLayoutValue('--stage-display-height')).toBe('240.75px')
    })
  })
})
