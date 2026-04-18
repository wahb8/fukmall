import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDefaultColors,
  DEFAULT_BACKGROUND,
  DEFAULT_FOREGROUND,
  GLOBAL_COLORS_STORAGE_KEY,
  loadColorsFromStorage,
  saveColorsToStorage,
  swapGlobalColors,
} from './colors'

describe('colors helpers', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('creates and swaps the default global colors', () => {
    const defaults = createDefaultColors()

    expect(defaults).toEqual({
      foreground: DEFAULT_FOREGROUND,
      background: DEFAULT_BACKGROUND,
    })
    expect(swapGlobalColors(defaults)).toEqual({
      foreground: DEFAULT_BACKGROUND,
      background: DEFAULT_FOREGROUND,
    })
  })

  it('loads valid colors from local storage and falls back on invalid data', () => {
    window.localStorage.setItem(GLOBAL_COLORS_STORAGE_KEY, JSON.stringify({
      foreground: '#111111',
      background: '#eeeeee',
    }))
    expect(loadColorsFromStorage()).toEqual({
      foreground: '#111111',
      background: '#eeeeee',
    })

    window.localStorage.setItem(GLOBAL_COLORS_STORAGE_KEY, '{"foreground":42}')
    expect(loadColorsFromStorage()).toEqual(createDefaultColors())
  })

  it('saves colors to local storage and ignores storage failures', () => {
    saveColorsToStorage({ foreground: '#222222', background: '#dddddd' })
    expect(window.localStorage.getItem(GLOBAL_COLORS_STORAGE_KEY)).toBe(
      JSON.stringify({ foreground: '#222222', background: '#dddddd' }),
    )

    const setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('storage failed')
    })

    expect(() => {
      saveColorsToStorage({ foreground: '#000000', background: '#ffffff' })
    }).not.toThrow()

    setItemSpy.mockRestore()
  })
})
