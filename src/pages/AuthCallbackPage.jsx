import { useEffect } from 'react'
import { AuthRouteShell } from '../components/site/AuthRouteShell'
import { useAuth } from '../auth/authContext'
import { getSafeRedirectPath, navigateTo } from '../navigation'

export function AuthCallbackPage({ redirectPath }) {
  const auth = useAuth()
  const nextPath = getSafeRedirectPath(redirectPath, '/app')

  useEffect(() => {
    if (auth.isLoading || !auth.isConfigured || !auth.isAuthenticated) {
      return
    }

    navigateTo(nextPath, { replace: true })
  }, [auth.isAuthenticated, auth.isConfigured, auth.isLoading, nextPath])

  if (!auth.isConfigured) {
    return (
      <AuthRouteShell
        title="Supabase auth is not configured."
        description="Add the browser Supabase URL and anon key before using sign-in callbacks."
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

  if (auth.isLoading || auth.isAuthenticated) {
    return (
      <AuthRouteShell
        title="Finishing sign-in"
        description="Completing your account session and opening the app."
      />
    )
  }

  return (
    <AuthRouteShell
      title="Sign-in did not complete."
      description="The callback session was not established. Try signing in again."
      actions={(
        <>
          <button
            className="landing-primary-cta auth-route-cta"
            type="button"
            onClick={() => navigateTo('/')}
          >
            Back home
          </button>
          <button
            className="landing-secondary-cta auth-route-cta"
            type="button"
            onClick={() => navigateTo('/pricing')}
          >
            View pricing
          </button>
        </>
      )}
    />
  )
}
