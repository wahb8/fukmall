import { useSyncExternalStore } from 'react'
import './App.css'
import { EditorPage } from './pages/EditorPage'
import { LandingPage } from './pages/LandingPage'
import { PricingPage } from './pages/PricingPage'

function normalizePathname(pathname) {
  if (pathname === '/app/' || pathname === '/app') {
    return '/app'
  }

  if (pathname === '/pricing/' || pathname === '/pricing') {
    return '/pricing'
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

  return normalizePathname(window.location.pathname)
}

function getServerSnapshot() {
  return '/'
}

export default function AppRoot() {
  const pathname = useSyncExternalStore(
    subscribeToLocationChange,
    getLocationSnapshot,
    getServerSnapshot,
  )

  if (pathname === '/app') {
    return <EditorPage />
  }

  if (pathname === '/pricing') {
    return <PricingPage />
  }

  return <LandingPage />
}
