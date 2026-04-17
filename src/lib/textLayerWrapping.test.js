import { describe, expect, it } from 'vitest'
import { createTextLayer } from './layers'
import { measureTextLayer, renderTextLayer, syncTextLayerLayout } from './textLayer'

describe('text layer word-aware wrapping', () => {
  it('wraps normal multi-word box text between words instead of splitting a word', () => {
    const layer = createTextLayer({
      mode: 'box',
      text: 'I love big mcchicken',
      boxWidth: 140,
      width: 140,
      height: 160,
      fontSize: 28,
    })

    const measurement = measureTextLayer(layer)

    expect(measurement.lines).toContain('mcchicken')
    expect(measurement.lines.join('\n')).not.toContain('mcch\nicken')
  })

  it('moves the whole next word onto the following line when it would overflow', () => {
    const layer = createTextLayer({
      mode: 'box',
      text: 'alpha beta gamma',
      boxWidth: 90,
      width: 90,
      height: 160,
      fontSize: 26,
    })

    const measurement = measureTextLayer(layer)

    expect(measurement.lines[0]).toBe('alpha')
    expect(measurement.lines[1]).toBe('beta')
  })

  it('preserves explicit newline breaks while still using word-aware wrapping inside each paragraph', () => {
    const layer = createTextLayer({
      mode: 'box',
      text: 'alpha beta\ngamma delta epsilon',
      boxWidth: 110,
      width: 110,
      height: 200,
      fontSize: 24,
    })

    const measurement = measureTextLayer(layer)

    expect(measurement.lines[0]).toBe('alpha')
    expect(measurement.lines[1]).toBe('beta')
    expect(measurement.lines).toContain('gamma')
  })

  it('keeps alignment-driven rendering working with word-aware wrapped lines', () => {
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
        fillCalls.push({ text, x, y })
      },
      strokeText() {},
    }
    const layer = createTextLayer({
      mode: 'box',
      text: 'alpha beta gamma',
      boxWidth: 100,
      width: 100,
      height: 200,
      fontSize: 24,
      textAlign: 'center',
    })

    renderTextLayer(context, layer)

    expect(fillCalls.some((entry) => entry.text === 'alpha')).toBe(true)
    expect(fillCalls.some((entry) => entry.text === 'beta')).toBe(true)
    expect(fillCalls.every((entry) => entry.x >= 0)).toBe(true)
  })

  it('wraps styled text by whole-word tokens using the same shared measurement path', () => {
    const layer = createTextLayer({
      mode: 'box',
      text: 'alpha beta gamma',
      boxWidth: 110,
      width: 110,
      height: 200,
      fontSize: 22,
      styleRanges: [
        { start: 6, end: 10, styles: { fontSize: 48, fontWeight: 700 } },
      ],
    })

    const measurement = measureTextLayer(layer)

    expect(measurement.lines.some((line) => line.includes('beta'))).toBe(true)
    expect(measurement.lines.join('\n')).not.toContain('be\nta')
  })

  it('keeps a truly unbreakable long token intact and expands bounds as the fallback', () => {
    const baseLayer = createTextLayer({
      mode: 'box',
      text: 'supercalifragilisticexpialidocious',
      boxWidth: 90,
      width: 90,
      height: 80,
      fontSize: 24,
    })
    const synced = syncTextLayerLayout({
      ...baseLayer,
      width: 90,
      height: 80,
      boxWidth: 90,
      boxHeight: 80,
    }, baseLayer)
    const measurement = measureTextLayer(synced)

    expect(measurement.lines).toEqual(['supercalifragilisticexpialidocious'])
    expect(synced.width).toBeGreaterThan(90)
  })

  it('does not change point text line behavior', () => {
    const layer = createTextLayer({
      mode: 'point',
      text: 'alpha beta gamma',
      fontSize: 24,
    })

    const measurement = measureTextLayer(layer)

    expect(measurement.lines).toEqual(['alpha beta gamma'])
  })
})
