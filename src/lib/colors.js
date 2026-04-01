export const DEFAULT_FOREGROUND = '#000000'
export const DEFAULT_BACKGROUND = '#ffffff'
export const GLOBAL_COLORS_STORAGE_KEY = 'fukmall.global-colors'

export function createDefaultColors() {
  return {
    foreground: DEFAULT_FOREGROUND,
    background: DEFAULT_BACKGROUND,
  }
}

export function swapGlobalColors(colors) {
  return {
    foreground: colors.background,
    background: colors.foreground,
  }
}

export function loadColorsFromStorage() {
  if (typeof window === 'undefined') {
    return createDefaultColors()
  }

  try {
    const rawValue = window.localStorage.getItem(GLOBAL_COLORS_STORAGE_KEY)

    if (!rawValue) {
      return createDefaultColors()
    }

    const parsedValue = JSON.parse(rawValue)

    if (
      typeof parsedValue?.foreground !== 'string' ||
      typeof parsedValue?.background !== 'string'
    ) {
      return createDefaultColors()
    }

    return {
      foreground: parsedValue.foreground,
      background: parsedValue.background,
    }
  } catch {
    return createDefaultColors()
  }
}

export function saveColorsToStorage(colors) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(GLOBAL_COLORS_STORAGE_KEY, JSON.stringify(colors))
  } catch {
    // Ignore storage failures for the MVP.
  }
}
