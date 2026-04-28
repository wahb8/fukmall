import { useState } from 'react'
import { AuthRouteShell } from '../components/site/AuthRouteShell'
import { useAuth } from '../auth/authContext'
import { navigateTo } from '../navigation'

const MIN_PASSWORD_LENGTH = 8

export function AuthResetPage() {
  const auth = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    setStatusMessage('')
    setErrorMessage('')

    const trimmedPassword = password.trim()

    if (trimmedPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    if (trimmedPassword !== confirmPassword.trim()) {
      setErrorMessage('Passwords do not match.')
      return
    }

    setIsSubmitting(true)

    try {
      await auth.updatePassword({
        password: trimmedPassword,
      })
      setStatusMessage('Password updated. Opening your workspace...')
      auth.clearPasswordRecovery()
      navigateTo('/app', { replace: true })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!auth.isConfigured) {
    return (
      <AuthRouteShell
        title="Supabase auth is not configured."
        description="Add the browser Supabase URL and anon key before using password recovery."
        actions={(
          <button
            className="landing-primary-cta auth-route-cta"
            type="button"
            onClick={() => navigateTo('/')}
          >
            Back home
          </button>
        )}
      />
    )
  }

  if (auth.isLoading) {
    return (
      <AuthRouteShell
        title="Checking your reset link"
        description="Preparing your password recovery session."
      />
    )
  }

  if (!auth.isAuthenticated || !auth.isPasswordRecovery) {
    return (
      <AuthRouteShell
        title="Reset link unavailable"
        description="This password reset link is invalid, expired, has already been used, or is not open in a recovery session."
        actions={(
          <button
            className="landing-primary-cta auth-route-cta"
            type="button"
            onClick={() => navigateTo('/')}
          >
            Back home
          </button>
        )}
      />
    )
  }

  return (
    <AuthRouteShell
      title="Choose a new password"
      description="Set a strong password to finish resetting your account."
    >
      <form className="auth-route-form" onSubmit={handleSubmit}>
        <label className="property-field auth-modal-field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            aria-label="New password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label className="property-field auth-modal-field">
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            aria-label="Confirm password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>

        {statusMessage ? (
          <p className="auth-status-message auth-status-message-success" role="status">
            {statusMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="auth-status-message auth-status-message-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="auth-route-actions">
          <button
            className="landing-secondary-cta auth-route-cta"
            type="button"
            onClick={() => navigateTo('/')}
          >
            Back home
          </button>

          <button
            className="landing-primary-cta auth-route-cta"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </form>
    </AuthRouteShell>
  )
}
