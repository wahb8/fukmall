import { describe, expect, it, vi } from 'vitest'
import {
  applyTextStyleToRange,
  getUniformTextStyleValueForRange,
  isTextRangeFullyBold,
  measureTextLayer,
  normalizeTextStyleRanges,
  remapTextStyleRangesForTextChange,
  renderTextLayer,
  resizeBoxText,
  updateTextContent,
  updateTextLayerFont,
  updateTextStyle,
} from './textLayer'
import { centerToTopLeft } from './layerGeometry'
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
    expect(measurement.width).toBe(60)
  })

  it('preserves point-text horizontal anchor across alignment changes', () => {
    const pointText = createTextLayer({
      mode: 'point',
      text: 'Hello',
      x: 124,
      textAlign: 'left',
    })

    const centered = updateTextStyle(pointText, { textAlign: 'center' })
    const rightAligned = updateTextStyle(pointText, { textAlign: 'right' })
    const centeredTopLeft = centerToTopLeft(centered.x, centered.y, centered.width, centered.height)
    const rightAlignedTopLeft = centerToTopLeft(
      rightAligned.x,
      rightAligned.y,
      rightAligned.width,
      rightAligned.height,
    )

    expect(centeredTopLeft.x + ((centered.width - 8) / 2)).toBe(120)
    expect(rightAlignedTopLeft.x + (rightAligned.width - 8)).toBe(120)
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

  it('normalizes overlapping style ranges into clean merged segments', () => {
    const ranges = normalizeTextStyleRanges([
      { start: 0, end: 5, styles: { color: '#111111' } },
      { start: 2, end: 7, styles: { fontWeight: 700 } },
      { start: 7, end: 9, styles: { fontWeight: 700 } },
    ], 10)

    expect(ranges).toEqual([
      { start: 0, end: 2, styles: { color: '#111111' } },
      { start: 2, end: 5, styles: { color: '#111111', fontWeight: 700 } },
      { start: 5, end: 9, styles: { fontWeight: 700 } },
    ])
  })

  it('applies partial style overrides only to the selected text range', () => {
    const layer = createTextLayer({ text: 'Hello world', mode: 'point' })
    const updated = applyTextStyleToRange(layer, 0, 5, { color: '#ff0000' })

    expect(updated.styleRanges).toEqual([
      { start: 0, end: 5, styles: { color: '#ff0000' } },
    ])
    expect(updated.color).toBe(layer.color)
  })

  it('updates only the selected range while preserving styles outside the selection', () => {
    const layer = createTextLayer({
      text: 'Hello world',
      mode: 'point',
      styleRanges: [{ start: 0, end: 11, styles: { color: '#ff0000' } }],
    })
    const updated = applyTextStyleToRange(layer, 6, 11, { fontFamily: '"Ubuntu", sans-serif' })

    expect(updated.styleRanges).toEqual([
      { start: 0, end: 6, styles: { color: '#ff0000' } },
      { start: 6, end: 11, styles: { color: '#ff0000', fontFamily: '"Ubuntu", sans-serif' } },
    ])
  })

  it('can remove bold from a selected range without affecting surrounding text', () => {
    const layer = createTextLayer({
      text: 'Hello world',
      mode: 'point',
      styleRanges: [{ start: 0, end: 11, styles: { fontWeight: 700 } }],
    })
    const updated = applyTextStyleToRange(layer, 6, 11, { fontWeight: 400 })

    expect(updated.styleRanges).toEqual([
      { start: 0, end: 6, styles: { fontWeight: 700 } },
      { start: 6, end: 11, styles: { fontWeight: 400 } },
    ])
    expect(isTextRangeFullyBold(updated, 0, 5)).toBe(true)
    expect(isTextRangeFullyBold(updated, 6, 11)).toBe(false)
  })

  it('reads the effective selected-range font size instead of only the base layer size', () => {
    const layer = createTextLayer({
      text: 'Hello world',
      mode: 'point',
      fontSize: 24,
      styleRanges: [{ start: 6, end: 11, styles: { fontSize: 48 } }],
    })

    expect(getUniformTextStyleValueForRange(layer, 0, 5, 'fontSize')).toBe(24)
    expect(getUniformTextStyleValueForRange(layer, 6, 11, 'fontSize')).toBe(48)
  })

  it('extends styled ranges when text is inserted inside them', () => {
    const nextRanges = remapTextStyleRangesForTextChange(
      'Hello',
      'Hello!',
      [{ start: 0, end: 5, styles: { color: '#ff0000' } }],
    )

    expect(nextRanges).toEqual([
      { start: 0, end: 6, styles: { color: '#ff0000' } },
    ])
  })

  it('keeps style ranges normalized when text content changes', () => {
    const layer = createTextLayer({
      text: 'Hello',
      mode: 'point',
      styleRanges: [{ start: 0, end: 5, styles: { color: '#ff0000' } }],
    })
    const updated = updateTextContent(layer, 'Hello!')

    expect(updated.styleRanges).toEqual([
      { start: 0, end: 6, styles: { color: '#ff0000' } },
    ])
  })

  it('measures mixed-style text using the effective run styles', () => {
    const baseLayer = createTextLayer({
      text: 'Hello',
      mode: 'point',
      fontSize: 20,
    })
    const mixedLayer = createTextLayer({
      text: 'Hello',
      mode: 'point',
      fontSize: 20,
      styleRanges: [{ start: 0, end: 5, styles: { fontSize: 40 } }],
    })

    expect(measureTextLayer(mixedLayer).width).toBeGreaterThan(measureTextLayer(baseLayer).width)
  })

  it('renders separate runs for differently styled text', () => {
    const fillCalls = []
    const strokeText = vi.fn()
    const context = {
      font: '16px sans-serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      measureText(text) {
        const fontSizeMatch = String(this.font).match(/(\d+(?:\.\d+)?)px/)
        const fontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : 16

        return {
          width: String(text ?? '').length * Math.max(fontSize * 0.6, 1),
          actualBoundingBoxAscent: fontSize * 0.8,
          actualBoundingBoxDescent: fontSize * 0.2,
        }
      },
      clearRect() {},
      save() {},
      restore() {},
      fillText(text, x, y) {
        fillCalls.push({
          text,
          x,
          y,
          font: this.font,
          fillStyle: this.fillStyle,
        })
      },
      strokeText,
    }
    const layer = createTextLayer({
      text: 'Hello world',
      mode: 'point',
      color: '#111111',
      styleRanges: [{ start: 6, end: 11, styles: { color: '#ff0000' } }],
    })

    renderTextLayer(context, layer)

    expect(fillCalls).toHaveLength(3)
    expect(fillCalls[0].text).toBe('Hello')
    expect(fillCalls[1].text).toBe(' ')
    expect(fillCalls[2].text).toBe('world')
    expect(fillCalls[0].fillStyle).toBe('#111111')
    expect(fillCalls[2].fillStyle).toBe('#ff0000')
    expect(strokeText).not.toHaveBeenCalled()
  })

  it('keeps box wrapping working with mixed-style runs', () => {
    const layer = createTextLayer({
      text: 'alpha beta gamma',
      boxWidth: 90,
      width: 90,
      height: 120,
      styleRanges: [{ start: 6, end: 10, styles: { fontSize: 48 } }],
    })

    const measurement = measureTextLayer(layer)

    expect(measurement.lines.length).toBeGreaterThan(1)
    expect(measurement.height).toBeGreaterThan(layer.fontSize)
  })

  it('renders mixed-style runs on a shared line baseline', () => {
    const fillCalls = []
    const context = {
      font: '16px sans-serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      measureText(text) {
        const fontSizeMatch = String(this.font).match(/(\d+(?:\.\d+)?)px/)
        const fontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : 16

        return {
          width: String(text ?? '').length * Math.max(fontSize * 0.6, 1),
          actualBoundingBoxAscent: fontSize * 0.8,
          actualBoundingBoxDescent: fontSize * 0.2,
        }
      },
      clearRect() {},
      save() {},
      restore() {},
      fillText(text, x, y) {
        fillCalls.push({ text, x, y, font: this.font })
      },
      strokeText() {},
    }
    const layer = createTextLayer({
      text: 'Hello world',
      mode: 'point',
      styleRanges: [{ start: 6, end: 11, styles: { fontWeight: 700, fontSize: 32 } }],
    })

    renderTextLayer(context, layer)

    expect(fillCalls).toHaveLength(3)
    expect(fillCalls[0].y).toBe(fillCalls[1].y)
    expect(fillCalls[1].y).toBe(fillCalls[2].y)
  })
})
