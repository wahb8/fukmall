import { describe, expect, it } from 'vitest'
import lightCloseIcon from '../assets/Close (X).svg'
import lightEraserIcon from '../assets/eraser.svg'
import lightGradientIcon from '../assets/gradient.svg'
import lightHiddenIcon from '../assets/Hidden.svg'
import lightPenIcon from '../assets/pen.svg'
import darkAddLayerIcon from '../assets/dark icons/add layer.svg'
import darkEraserIcon from '../assets/dark icons/eraser.svg'
import darkUndoIcon from '../assets/dark icons/undo.svg'
import { getEditorIcons, getThemeIcon } from './iconAssets'

describe('iconAssets', () => {
  it('keeps the light assets in light mode', () => {
    const icons = getEditorIcons('light')

    expect(icons.eraser).toBe(lightEraserIcon)
    expect(icons.gradient).toBe(lightGradientIcon)
    expect(icons.close).toBe(lightCloseIcon)
  })

  it('swaps only icons with explicit dark replacements', () => {
    const icons = getEditorIcons('dark')

    expect(icons.eraser).toBe(darkEraserIcon)
    expect(icons.undo).toBe(darkUndoIcon)
    expect(icons.addLayer).toBe(darkAddLayerIcon)
    expect(icons.gradient).toBe(lightGradientIcon)
    expect(icons.pen).toBe(lightPenIcon)
    expect(icons.close).toBe(lightCloseIcon)
    expect(icons.hidden).toBe(lightHiddenIcon)
  })

  it('falls back safely when an icon name is not mapped', () => {
    expect(getThemeIcon('missing-icon', 'dark')).toBe('')
  })
})
