import { describe, expect, it } from 'vitest'
import {
  measureTextLayer,
  resizeBoxText,
  updateTextContent,
  updateTextLayerFont,
  updateTextStyle,
} from './textLayer'
import { createTextLayer } from './layers'

describe('text layer helpers', () => {
  it('wraps box text into multiple lines when the box width is constrained', () => {
    const layer = createTextLayer({
      text: 'alpha beta gamma',
      boxWidth: 60,
      width: 60,
      height: 100,
    })

    const measurement = measureTextLayer(layer)

    expect(measurement.lines.length).toBeGreaterThan(1)
    expect(measurement.width).toBe(68)
  })

  it('preserves point-text horizontal anchor across alignment changes', () => {
    const pointText = createTextLayer({
      mode: 'point',
      text: 'Hello',
      x: 120,
      textAlign: 'left',
    })

    const centered = updateTextStyle(pointText, { textAlign: 'center' })
    const rightAligned = updateTextStyle(pointText, { textAlign: 'right' })

    expect(centered.x + ((centered.width - 8) / 2)).toBe(120)
    expect(rightAligned.x + (rightAligned.width - 8)).toBe(120)
  })

  it('updates text content and keeps the shared layout path in sync', () => {
    const layer = createTextLayer({ text: 'One', mode: 'point' })
    const updated = updateTextContent(layer, 'Two words')

    expect(updated.text).toBe('Two words')
    expect(updated.name).toBe('Two words')
    expect(updated.measuredWidth).toBeGreaterThan(layer.measuredWidth)
  })

  it('updates font family through the shared style helper path', () => {
    const layer = createTextLayer()
    const updated = updateTextLayerFont(layer, '"Ubuntu", sans-serif')

    expect(updated.fontFamily).toBe('"Ubuntu", sans-serif')
    expect(updated.measuredWidth).toBeGreaterThan(0)
  })

  it('resizes box text while preserving box mode', () => {
    const layer = createTextLayer({ boxWidth: 120, boxHeight: 80 })
    const resized = resizeBoxText(layer, 200, 140)

    expect(resized.mode).toBe('box')
    expect(resized.boxWidth).toBe(200)
    expect(resized.boxHeight).toBe(140)
    expect(resized.width).toBe(200)
    expect(resized.height).toBe(140)
  })
})
