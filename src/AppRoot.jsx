import { useEffect, useSyncExternalStore } from 'react'
import './App.css'
import { useAuth } from './auth/authContext'
import { EditorPage } from './pages/EditorPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { AuthResetPage } from './pages/AuthResetPage'
import { LandingPage } from './pages/LandingPage'
import { PricingPage } from './pages/PricingPage'
import { buildPath, getSafeRedirectPath, navigateTo } from './navigation'

function normalizePathname(pathname) {
  if (pathname === '/app/' || pathname === '/app') {
    return '/app'
  }

  if (pathname === '/pricing/' || pathname === '/pricing') {
    return '/pricing'
  }

  if (pathname === '/auth/reset/' || pathname === '/auth/reset') {
    return '/auth/reset'
  }

  if (pathname === '/auth/callback/' || pathname === '/auth/callback') {
    return '/auth/callback'
  }

  if (pathname === '/' || pathname === '') {
    return '/'
  }

  return pathname
}

function subscribeToLocationChange(callback) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  window.addEventListener('popstate', callback)

  return () => {
    window.removeEventListener('popstate', callback)
  }
}

function getLocationSnapshot() {
  if (typeof window === 'undefined') {
    return '/'
  }

  return `${normalizePathname(window.location.pathname)}${window.location.search}`
}

function getServerSnapshot() {
  return '/'
}

function parseLocationSnapshot(snapshot) {
  const [pathname, ...searchParts] = snapshot.split('?')

  return {
    pathname: pathname || '/',
    search: searchParts.length > 0 ? `?${searchParts.join('?')}` : '',
  }
}

function ProtectedEditorRoute() {
  const auth = useAuth()

  useEffect(() => {
    if (!auth.isConfigured || auth.isLoading || auth.isAuthenticated) {
      return
    }

    navigateTo(buildPath('/', {
      auth: 'login',
      redirect: '/app',
    }), {
      replace: true,
    })
  }, [auth.isAuthenticated, auth.isConfigured, auth.isLoading])

  if (!auth.isConfigured) {
    return (
      <main className="app-shell auth-route-shell">
        <section className="auth-route-card">
          <div className="auth-route-copy">
            <h1 className="auth-route-title">Supabase auth is not configured.</h1>
            <p className="auth-route-description">
              Add the browser Supabase URL and anon key before opening the protected editor.
            </p>
          </div>
        </section>
      </main>
    )
  }

  if (auth.isLoading) {
    return (
      <main className="app-shell auth-route-shell">
        <section className="auth-route-card">
          <div className="auth-route-copy">
            <h1 className="auth-route-title">Checking your session</h1>
            <p className="auth-route-description">
              Verifying workspace access before the editor loads.
            </p>
          </div>
        </section>
      </main>
    )
  }

  if (!auth.isAuthenticated) {
    return null
  }

  return <EditorPage />
}

export default function AppRoot() {
  const locationSnapshot = useSyncExternalStore(
    subscribeToLocationChange,
    getLocationSnapshot,
    getServerSnapshot,
  )
  const { pathname, search } = parseLocationSnapshot(locationSnapshot)
  const searchParams = new URLSearchParams(search)
  const authQueryMode = searchParams.get('auth')
  const authMode = authQueryMode === 'signup' || authQueryMode === 'login'
    ? authQueryMode
    : null
  const redirectPath = getSafeRedirectPath(searchParams.get('redirect'), '/app')
  const callbackRedirectPath = getSafeRedirectPath(searchParams.get('next'), '/app')

  if (pathname === '/app') {
    return <ProtectedEditorRoute />
  }

  if (pathname === '/pricing') {
    return (
      <PricingPage
        key={locationSnapshot}
        initialAuthMode={authMode}
        initialAuthRedirectPath={redirectPath}
      />
    )
  }

  if (pathname === '/auth/reset') {
    return <AuthResetPage />
  }

  if (pathname === '/auth/callback') {
    return <AuthCallbackPage redirectPath={callbackRedirectPath} />
  }

  return (
    <LandingPage
      key={locationSnapshot}
      initialAuthMode={authMode}
      initialAuthRedirectPath={redirectPath}
    />
  )
}
