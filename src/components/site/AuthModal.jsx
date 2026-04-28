import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/authContext'
import { navigateTo } from '../../navigation'

const MIN_PASSWORD_LENGTH = 8

function getAuthContent(mode) {
  if (mode === 'reset') {
    return {
      title: 'Reset password',
      submitLabel: 'Send reset link',
      fields: [
        { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
      ],
    }
  }

  if (mode === 'signup') {
    return {
      title: 'Sign up',
      submitLabel: 'Create account',
      fields: [
        { key: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
        { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
        { key: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
      ],
    }
  }

  return {
    title: 'Log in',
    submitLabel: 'Log in',
    fields: [
      { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
      { key: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
    ],
  }
}

const EMPTY_FORM_VALUES = {
  name: '',
  email: '',
  password: '',
}

export function AuthModal({
  isOpen,
  mode = 'login',
  redirectPath = '/app',
  onClose,
}) {
  const auth = useAuth()
  const [authView, setAuthView] = useState(mode)
  const [formValues, setFormValues] = useState(EMPTY_FORM_VALUES)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setAuthView(mode)
    setFormValues(EMPTY_FORM_VALUES)
    setStatusMessage('')
    setErrorMessage('')
    setIsSubmitting(false)
  }, [mode, isOpen])

  if (!isOpen) {
    return null
  }

  const content = getAuthContent(authView)
  const isLoginView = authView === 'login'
  const isResetView = authView === 'reset'
  const isSignupView = authView === 'signup'

  function updateFieldValue(fieldKey, nextValue) {
    setFormValues((currentValues) => ({
      ...currentValues,
      [fieldKey]: nextValue,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    setStatusMessage('')
    setErrorMessage('')
    setIsSubmitting(true)

    const email = formValues.email.trim()
    const password = formValues.password.trim()
    const name = formValues.name.trim()

    try {
      if (isResetView) {
        if (!email) {
          throw new Error('Email is required.')
        }

        await auth.sendPasswordResetEmail({
          email,
        })
        setStatusMessage('Password reset link sent. Check your inbox to continue.')
        return
      }

      if (!email) {
        throw new Error('Email is required.')
      }

      if (!password) {
        throw new Error('Password is required.')
      }

      if (isSignupView) {
        if (!name) {
          throw new Error('Name is required.')
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
        }

        const result = await auth.signUp({
          email,
          password,
          name,
          redirectPath,
        })

        if (result.needsEmailConfirmation) {
          setStatusMessage('Check your email to confirm your account, then come back to the app.')
          return
        }
      } else {
        await auth.signInWithPassword({
          email,
          password,
        })
      }

      onClose()
      navigateTo(redirectPath)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to continue.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleGoogleSignIn() {
    setStatusMessage('')
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await auth.signInWithGoogle({
        redirectPath,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to start Google sign-in.')
      setIsSubmitting(false)
    }
  }

  function handleAuthViewChange(nextView) {
    setAuthView(nextView)
    setStatusMessage('')
    setErrorMessage('')
    setIsSubmitting(false)
  }

  return (
    <div className="modal-backdrop auth-modal-backdrop" onPointerDown={onClose} role="presentation">
      <div
        className="modal-card auth-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={content.title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header auth-modal-header">
          <h2 className="auth-modal-title">{content.title}</h2>

          <button
            className="auth-modal-close"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <form className="auth-modal-form" onSubmit={handleSubmit}>
          {!isResetView ? (
            <>
              <button
                className="auth-modal-oauth-button"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
              >
                Continue with Google
              </button>

              <div className="auth-modal-divider" aria-hidden="true">
                <span />
                <small>or</small>
                <span />
              </div>
            </>
          ) : null}

          <div className="auth-modal-fields">
            {content.fields.map((field) => (
              <label key={field.key} className="property-field auth-modal-field">
                <span>{field.label}</span>
                <input
                  type={field.type}
                  autoComplete={field.autoComplete}
                  aria-label={field.label}
                  value={formValues[field.key] ?? ''}
                  onChange={(event) => updateFieldValue(field.key, event.target.value)}
                />
              </label>
            ))}
          </div>

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

          {isLoginView ? (
            <div className="auth-modal-meta-row">
              <button
                className="auth-modal-inline-action"
                type="button"
                onClick={() => handleAuthViewChange('reset')}
              >
                Forgot password?
              </button>
            </div>
          ) : null}

          <div className="modal-actions auth-modal-actions">
            {isResetView ? (
              <button
                className="auth-modal-inline-action"
                type="button"
                onClick={() => handleAuthViewChange('login')}
              >
                Back to log in
              </button>
            ) : null}
            <button
              className="action-button active auth-modal-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Working...' : content.submitLabel}
            </button>
          </div>

          {!isResetView ? (
            <div className="auth-modal-switch-row">
              <button
                className="auth-modal-inline-action"
                type="button"
                onClick={() => handleAuthViewChange(isLoginView ? 'signup' : 'login')}
              >
                {isLoginView ? 'Need an account? Sign up' : 'Already have an account? Log in'}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  )
}
