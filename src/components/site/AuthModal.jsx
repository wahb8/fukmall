import { useEffect, useState } from 'react'

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

export function AuthModal({
  isOpen,
  mode = 'login',
  onClose,
}) {
  const [authView, setAuthView] = useState(mode)

  useEffect(() => {
    setAuthView(mode)
  }, [mode, isOpen])

  if (!isOpen) {
    return null
  }

  const content = getAuthContent(authView)
  const isLoginView = authView === 'login'
  const isResetView = authView === 'reset'

  function handleSubmit(event) {
    event.preventDefault()
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
          <div className="auth-modal-fields">
            {content.fields.map((field) => (
              <label key={field.key} className="property-field auth-modal-field">
                <span>{field.label}</span>
                <input
                  type={field.type}
                  autoComplete={field.autoComplete}
                  aria-label={field.label}
                />
              </label>
            ))}
          </div>

          {isLoginView ? (
            <div className="auth-modal-meta-row">
              <button
                className="auth-modal-inline-action"
                type="button"
                onClick={() => setAuthView('reset')}
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
                onClick={() => setAuthView('login')}
              >
                Back to log in
              </button>
            ) : null}
            <button className="action-button active auth-modal-submit" type="submit">
              {content.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
