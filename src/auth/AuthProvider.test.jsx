import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from './authContext'
import { AuthProvider } from './AuthProvider'

const {
  getSupabaseBrowserClientMock,
  getSupabaseBrowserConfigMock,
} = vi.hoisted(() => ({
  getSupabaseBrowserClientMock: vi.fn(),
  getSupabaseBrowserConfigMock: vi.fn(),
}))

vi.mock('../lib/supabaseBrowser', () => ({
  getSupabaseBrowserClient: getSupabaseBrowserClientMock,
  getSupabaseBrowserConfig: getSupabaseBrowserConfigMock,
}))

function createSupabaseClient({
  session = null,
} = {}) {
  const unsubscribe = vi.fn()
  let authStateChangeHandler = null

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session,
        },
        error: null,
      }),
      onAuthStateChange: vi.fn((handler) => {
        authStateChangeHandler = handler
        return {
          data: {
            subscription: {
              unsubscribe,
            },
          },
        }
      }),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'user-1',
          },
        },
        error: null,
      }),
      signOut: vi.fn(),
    },
    emitAuthStateChange(event, nextSession) {
      authStateChangeHandler?.(event, nextSession)
    },
    unsubscribe,
  }
}

function AuthStateProbe() {
  const auth = useAuth()

  return (
    <>
      <div data-testid="status">{auth.status}</div>
      <div data-testid="is-authenticated">{String(auth.isAuthenticated)}</div>
      <div data-testid="is-password-recovery">{String(auth.isPasswordRecovery)}</div>
      <button
        type="button"
        onClick={() => auth.updatePassword({ password: 'new-password-123' })}
      >
        Update password
      </button>
      <button
        type="button"
        onClick={() => auth.clearPasswordRecovery()}
      >
        Clear recovery
      </button>
    </>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    getSupabaseBrowserConfigMock.mockReturnValue({
      url: 'https://project.supabase.co',
      anonKey: 'anon-key',
      isConfigured: true,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    cleanup()
  })

  it('restores the recovery flag from session storage only when a session exists', async () => {
    window.sessionStorage.setItem('fukmall.auth.password-recovery', 'true')

    const client = createSupabaseClient()
    getSupabaseBrowserClientMock.mockReturnValue(client)

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false')
    expect(screen.getByTestId('is-password-recovery')).toHaveTextContent('false')
  })

  it('marks the session as a password recovery flow when Supabase emits PASSWORD_RECOVERY', async () => {
    const session = {
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    }
    const client = createSupabaseClient({ session })
    getSupabaseBrowserClientMock.mockReturnValue(client)

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true')
    })

    client.emitAuthStateChange('PASSWORD_RECOVERY', session)

    await waitFor(() => {
      expect(screen.getByTestId('is-password-recovery')).toHaveTextContent('true')
    })

    expect(window.sessionStorage.getItem('fukmall.auth.password-recovery')).toBe('true')
  })

  it('clears the recovery flag after updatePassword succeeds', async () => {
    const session = {
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    }
    window.sessionStorage.setItem('fukmall.auth.password-recovery', 'true')
    const client = createSupabaseClient({ session })
    getSupabaseBrowserClientMock.mockReturnValue(client)

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('is-password-recovery')).toHaveTextContent('true')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => {
      expect(client.auth.updateUser).toHaveBeenCalledWith({
        password: 'new-password-123',
      })
    })

    expect(screen.getByTestId('is-password-recovery')).toHaveTextContent('false')
    expect(window.sessionStorage.getItem('fukmall.auth.password-recovery')).toBeNull()
  })

  it('clears the recovery flag when clearPasswordRecovery is called directly', async () => {
    const session = {
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    }
    window.sessionStorage.setItem('fukmall.auth.password-recovery', 'true')
    const client = createSupabaseClient({ session })
    getSupabaseBrowserClientMock.mockReturnValue(client)

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('is-password-recovery')).toHaveTextContent('true')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear recovery' }))

    await waitFor(() => {
      expect(screen.getByTestId('is-password-recovery')).toHaveTextContent('false')
    })

    expect(window.sessionStorage.getItem('fukmall.auth.password-recovery')).toBeNull()
  })
})
