import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { EditorPage } from './EditorPage'

const {
  getSupabaseBrowserClientMock,
  fetchDefaultBusinessProfileMock,
  completeOnboardingMock,
} = vi.hoisted(() => ({
  getSupabaseBrowserClientMock: vi.fn(),
  fetchDefaultBusinessProfileMock: vi.fn(),
  completeOnboardingMock: vi.fn(),
}))

vi.mock('../App', () => ({
  default: () => <div data-testid="editor-app">Editor app</div>,
}))

vi.mock('../lib/supabaseBrowser', () => ({
  getSupabaseBrowserClient: getSupabaseBrowserClientMock,
}))

vi.mock('../lib/onboarding', () => ({
  fetchDefaultBusinessProfile: fetchDefaultBusinessProfileMock,
  completeOnboarding: completeOnboardingMock,
}))

function createAuthValue(overrides = {}) {
  return {
    status: 'ready',
    isLoading: false,
    isConfigured: true,
    isAuthenticated: true,
    user: {
      id: 'user-1',
      email: 'user@example.com',
    },
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

describe('EditorPage', () => {
  beforeEach(() => {
    getSupabaseBrowserClientMock.mockReturnValue({})
    fetchDefaultBusinessProfileMock.mockReset()
    completeOnboardingMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('shows onboarding when no default business profile exists', async () => {
    fetchDefaultBusinessProfileMock.mockResolvedValue(null)

    render(
      <AuthContext.Provider value={createAuthValue()}>
        <EditorPage />
      </AuthContext.Provider>,
    )

    expect(screen.getByTestId('editor-app')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Business onboarding' })).toBeInTheDocument()
    })
  })

  it('reloads the profile after onboarding is completed', async () => {
    fetchDefaultBusinessProfileMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'profile-1',
        name: 'Moonline Cafe',
      })
    completeOnboardingMock.mockResolvedValue({
      id: 'profile-1',
    })

    render(
      <AuthContext.Provider value={createAuthValue()}>
        <EditorPage />
      </AuthContext.Provider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Business onboarding' })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Business name'), {
      target: { value: 'Moonline Cafe' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cafe' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Warm and friendly' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Creating!' }))

    await waitFor(() => {
      expect(completeOnboardingMock).toHaveBeenCalledWith({
        name: 'Moonline Cafe',
        businessType: 'Cafe',
        tonePreference: 'Warm and friendly',
        brandColors: [],
        logoFile: null,
        referenceFiles: [],
      })
    })

    await waitFor(() => {
      expect(fetchDefaultBusinessProfileMock).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('dialog', { name: 'Business onboarding' })).toBeNull()
    })
  })
})
