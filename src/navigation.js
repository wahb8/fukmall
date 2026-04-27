export function navigateTo(pathname) {
  if (typeof window === 'undefined' || window.location.pathname === pathname) {
    return
  }

  window.history.pushState({}, '', pathname)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
