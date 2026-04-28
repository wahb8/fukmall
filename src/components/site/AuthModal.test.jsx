import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/authContext'
import { AuthModal } from './AuthModal'

const { navigateToMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
}))

vi.mock('../../navigation', () => ({
  navigateTo: navigateToMock,
}))

function createAuthValue(overrides = {}) {
  return {
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
    ...overrides,
  }
}

function renderAuthModal({
  authOverrides = {},
  modalProps = {},
} = {}) {
  const authValue = createAuthValue(authOverrides)
  const onClose = modalProps.onClose ?? vi.fn()

  render(
    <AuthContext.Provider value={authValue}>
      <AuthModal
        isOpen
        mode="login"
        redirectPath="/pricing"
        onClose={onClose}
        {...modalProps}
      />
    </AuthContext.Provider>,
  )

  return {
    authValue,
    onClose,
  }
}

describe('AuthModal', () => {
  beforeEach(() => {
    navigateToMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('signs in with email and redirects after login succeeds', async () => {
    const { authValue, onClose } = renderAuthModal()
    const dialog = screen.getByRole('dialog', { name: 'Log in' })

    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: ' user@example.com ' },
    })
    fireEvent.change(within(dialog).getByLabelText('Password'), {
      target: { value: ' secret-pass ' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Log in' }))

    await waitFor(() => {
      expect(authValue.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'secret-pass',
      })
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith('/pricing')
  })

  it('starts Google sign-in with the current redirect path', async () => {
    const { authValue } = renderAuthModal()
    const dialog = screen.getByRole('dialog', { name: 'Log in' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue with Google' }))

    await waitFor(() => {
      expect(authValue.signInWithGoogle).toHaveBeenCalledWith({
        redirectPath: '/pricing',
      })
    })

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('sends a reset email after switching to the reset view', async () => {
    const { authValue, onClose } = renderAuthModal()
    const loginDialog = screen.getByRole('dialog', { name: 'Log in' })

    fireEvent.click(within(loginDialog).getByRole('button', { name: 'Forgot password?' }))

    const resetDialog = screen.getByRole('dialog', { name: 'Reset password' })

    fireEvent.change(within(resetDialog).getByLabelText('Email'), {
      target: { value: ' reset@example.com ' },
    })
    fireEvent.click(within(resetDialog).getByRole('button', { name: 'Send reset link' }))

    await waitFor(() => {
      expect(authValue.sendPasswordResetEmail).toHaveBeenCalledWith({
        email: 'reset@example.com',
      })
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Password reset link sent. Check your inbox to continue.',
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('shows confirmation instructions instead of redirecting when signup needs email confirmation', async () => {
    const { authValue, onClose } = renderAuthModal({
      authOverrides: {
        signUp: vi.fn().mockResolvedValue({
          user: {
            id: 'user-1',
          },
          session: null,
          needsEmailConfirmation: true,
        }),
      },
      modalProps: {
        mode: 'signup',
        redirectPath: '/app',
      },
    })

    const dialog = screen.getByRole('dialog', { name: 'Sign up' })

    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: ' User Name ' },
    })
    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: ' signup@example.com ' },
    })
    fireEvent.change(within(dialog).getByLabelText('Password'), {
      target: { value: ' password-123 ' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(authValue.signUp).toHaveBeenCalledWith({
        email: 'signup@example.com',
        password: 'password-123',
        name: 'User Name',
        redirectPath: '/app',
      })
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Check your email to confirm your account, then come back to the app.',
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(navigateToMock).not.toHaveBeenCalled()
  })
})
