import { describe, expect, it } from 'vitest'
import {
  applyTextStyleToRange,
  detectTextDirection,
  getUniformTextStyleValueForRange,
  getTextEditorOverlayGeometry,
  isTextRangeFullyBold,
  measureTextLayer,
  resizeBoxText,
  normalizeTextStyleRanges,
  remapTextStyleRangesForTextChange,
  renderTextLayer,
  updateTextContent,
  updateTextLayerFont,
  updateTextStyle,
} from './textLayer'
import { centerToTopLeft } from './layerGeometry'
import { createTextLayer } from './layers'

describe('text layer helpers', () => {
  function createRecordingContext() {
    const fillCalls = []
    const strokeCalls = []
    const context = {
      font: '16px sans-serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      direction: 'ltr',
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
          textAlign: this.textAlign,
          direction: this.direction,
        })
      },
      strokeText(text, x, y) {
        strokeCalls.push({
          text,
          x,
          y,
          textAlign: this.textAlign,
          direction: this.direction,
        })
      },
    }

    return {
      context,
      fillCalls,
      strokeCalls,
    }
  }

  it('detects Arabic-script text as rtl', () => {
    expect(detectTextDirection('مرحبا بالعالم')).toBe('rtl')
    expect(detectTextDirection('Hello world')).toBe('ltr')
  })

  it('wraps box text into multiple lines when the box width is constrained', () => {
    const layer = createTextLayer({
      text: 'alpha beta gamma',
      boxWidth: 60,
      width: 60,
      height: 100,
    })

    const measurement = measureTextLayer(layer)

    expect(measurement.lines.length).toBeGreaterThan(1)
    expect(measurement.width).toBe(126)
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

  it('preserves point-text horizontal anchor for Arabic text across alignment changes', () => {
    const pointText = createTextLayer({
      mode: 'point',
      text: 'مرحبا',
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
    expect(resized.autoFit).toBe(true)
    expect(resized.boxWidth).toBe(200)
    expect(resized.boxHeight).toBe(140)
    expect(resized.width).toBe(200)
    expect(resized.height).toBe(140)
  })

  it('auto-fits box text down when the box shrinks and back up when the box grows', () => {
    const layer = createTextLayer({
      mode: 'box',
      text: 'Auto fit me down and back up',
      fontSize: 64,
      boxWidth: 360,
      boxHeight: 160,
      width: 360,
      height: 160,
    })
    const shrunk = resizeBoxText(layer, 140, 72)
    const grown = resizeBoxText(shrunk, 360, 160)

    expect(shrunk.fontSize).toBeLessThan(layer.fontSize)
    expect(shrunk.measuredWidth).toBeLessThanOrEqual(shrunk.width)
    expect(shrunk.measuredHeight).toBeLessThanOrEqual(shrunk.height)
    expect(grown.fontSize).toBeGreaterThan(shrunk.fontSize)
    expect(grown.measuredWidth).toBeLessThanOrEqual(grown.width)
    expect(grown.measuredHeight).toBeLessThanOrEqual(grown.height)
  })

  it('auto-fits the seeded headline text upward for a larger resized box', () => {
    const layer = createTextLayer({
      mode: 'box',
      text: 'A cleaner\nlayer stack',
      fontSize: 40,
      boxWidth: 300,
      boxHeight: 120,
      width: 300,
      height: 120,
    })
    const resized = resizeBoxText(layer, 479.607476635514, 340.2056074766355)
    expect(resized.fontSize).toBeGreaterThan(40)
    expect(resized.measuredWidth).toBeLessThanOrEqual(resized.width)
    expect(resized.measuredHeight).toBeLessThanOrEqual(resized.height)
    expect(measureTextLayer(resized).requiredWidth).toBeLessThanOrEqual(resized.width)
    expect(measureTextLayer(resized).requiredHeight).toBeLessThanOrEqual(resized.height)
  })

  it('auto-fit keeps exact required dimensions finite for fractional resized boxes', () => {
    const resized = resizeBoxText(createTextLayer({
      mode: 'box',
      text: 'A cleaner\nlayer stack',
      fontSize: 40,
      boxWidth: 300,
      boxHeight: 120,
      width: 300,
      height: 120,
    }), 479.607476635514, 340.2056074766355)
    const measurement = measureTextLayer(resized)

    expect(Number.isFinite(measurement.requiredWidth)).toBe(true)
    expect(Number.isFinite(measurement.requiredHeight)).toBe(true)
    expect(measurement.requiredWidth).toBeLessThanOrEqual(resized.width)
    expect(measurement.requiredHeight).toBeLessThanOrEqual(resized.height)
  })

  it('auto-fit respects both width and height constraints for wrapped box text', () => {
    const layer = createTextLayer({
      mode: 'box',
      text: 'alpha beta gamma delta epsilon zeta',
      fontSize: 72,
      textAlign: 'center',
      boxWidth: 180,
      boxHeight: 96,
      width: 180,
      height: 96,
      autoFit: true,
    })
    const synced = updateTextStyle(layer, {})

    expect(synced.width).toBe(180)
    expect(synced.height).toBe(96)
    expect(synced.fontSize).toBeLessThan(72)
    expect(synced.measuredWidth).toBeLessThanOrEqual(180)
    expect(synced.measuredHeight).toBeLessThanOrEqual(96)
    expect(measureTextLayer(synced).lines.length).toBeGreaterThan(1)
  })

  it('auto-fit scales style-range font sizes with the shared styled-run path', () => {
    const layer = createTextLayer({
      mode: 'box',
      text: 'Hello world',
      fontSize: 56,
      boxWidth: 180,
      boxHeight: 70,
      width: 180,
      height: 70,
      autoFit: true,
      styleRanges: [{ start: 6, end: 11, styles: { fontSize: 28, fontWeight: 700 } }],
    })
    const synced = updateTextStyle(layer, {})

    expect(synced.fontSize).toBeLessThan(56)
    expect(synced.styleRanges).toEqual([
      {
        start: 6,
        end: 11,
        styles: {
          fontSize: expect.any(Number),
          fontWeight: 700,
        },
      },
    ])
    expect(synced.styleRanges[0].styles.fontSize).toBeLessThan(28)
    expect(synced.measuredWidth).toBeLessThanOrEqual(synced.width)
    expect(synced.measuredHeight).toBeLessThanOrEqual(synced.height)
  })

  it('disables box auto-fit when the full-layer font size is edited explicitly', () => {
    const autoFitLayer = resizeBoxText(createTextLayer({
      mode: 'box',
      text: 'Auto fit headline',
      fontSize: 64,
      boxWidth: 220,
      boxHeight: 90,
      width: 220,
      height: 90,
    }), 220, 90)
    const updated = updateTextStyle(autoFitLayer, { fontSize: 24 })

    expect(autoFitLayer.autoFit).toBe(true)
    expect(updated.autoFit).toBe(false)
    expect(updated.fontSize).toBe(24)
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
    const { context, fillCalls, strokeCalls } = createRecordingContext()
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
    expect(strokeCalls).toHaveLength(0)
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
    const { context, fillCalls } = createRecordingContext()
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

  it('renders Arabic runs in rtl visual order instead of reversed ltr word order', () => {
    const { context, fillCalls } = createRecordingContext()
    const layer = createTextLayer({
      text: '\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645',
      mode: 'point',
    })

    renderTextLayer(context, layer)

    expect(fillCalls).toHaveLength(1)
    expect(fillCalls[0].text).toBe('\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645')
    expect(fillCalls[0].direction).toBe('rtl')
    expect(fillCalls[0].textAlign).toBe('right')
  })

  it('does not fall back to per-character drawing for Arabic when letter spacing is set', () => {
    const { context, fillCalls } = createRecordingContext()
    const layer = createTextLayer({
      text: '\u0645\u0631\u062d\u0628\u0627',
      mode: 'point',
      letterSpacing: 12,
    })

    renderTextLayer(context, layer)

    expect(fillCalls).toHaveLength(1)
    expect(fillCalls[0].text).toBe('\u0645\u0631\u062d\u0628\u0627')
  })

  it('keeps Arabic multiline overlay geometry in sync with explicit newline insertion', () => {
    const layer = createTextLayer({
      text: '\u0645\u0631\u062d\u0628\u0627\n\u0628\u0643\u0645',
      mode: 'point',
    })
    const measurement = measureTextLayer(layer)
    const overlay = getTextEditorOverlayGeometry(layer, layer.text.length, layer.text.length)

    expect(measurement.lines).toEqual(['\u0645\u0631\u062d\u0628\u0627', '\u0628\u0643\u0645'])
    expect(measurement.layoutLines[0].direction).toBe('rtl')
    expect(measurement.layoutLines[1].direction).toBe('rtl')
    expect(overlay.caretRect?.y).toBeGreaterThan(measurement.paddingTop)
  })

  it('keeps mixed Arabic and Latin runs renderable with per-run direction', () => {
    const { context, fillCalls } = createRecordingContext()
    const layer = createTextLayer({
      text: '\u0645\u0631\u062d\u0628\u0627 test',
      mode: 'point',
      styleRanges: [{ start: 6, end: 10, styles: { fontWeight: 700 } }],
    })

    renderTextLayer(context, layer)

    expect(fillCalls.some((call) => call.text === '\u0645\u0631\u062d\u0628\u0627 ' && call.direction === 'rtl')).toBe(true)
    expect(fillCalls.some((call) => call.text === 'test' && call.direction === 'ltr')).toBe(true)
  })
})
