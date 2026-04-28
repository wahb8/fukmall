function toRelativeUrl(target) {
  const nextUrl = new URL(target, window.location.origin)
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}

export function navigateTo(target, options = {}) {
  if (typeof window === 'undefined') {
    return
  }

  const nextLocation = toRelativeUrl(target)
  const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`

  if (currentLocation === nextLocation) {
    return
  }

  if (options.replace) {
    window.history.replaceState({}, '', nextLocation)
  } else {
    window.history.pushState({}, '', nextLocation)
  }

  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function buildPath(pathname, query = {}) {
  const searchParams = new URLSearchParams()

  Object.entries(query).forEach(([key, value]) => {
    if (value == null || value === '') {
      return
    }

    searchParams.set(key, String(value))
  })

  const search = searchParams.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function getSafeRedirectPath(value, fallback = '/app') {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmedValue = value.trim()

  if (!trimmedValue.startsWith('/') || trimmedValue.startsWith('//')) {
    return fallback
  }

  return trimmedValue
}
