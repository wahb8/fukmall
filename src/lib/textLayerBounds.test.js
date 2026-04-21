import { describe, expect, it } from 'vitest'
import { createExactTextLayerFromJsonSpec } from '../editor/addLayerPanelHelpers'
import { centerToTopLeft } from './layerGeometry'
import { createTextLayer } from './layers'
import { renderTextLayerToCanvas } from './raster'
import { measureTextLayer, syncTextLayerLayout, updateTextContent, updateTextStyle } from './textLayer'

const POINT_TEXT_PADDING_EXPECTED = 4

describe('text layer anti-clipping bounds', () => {
  it('grows box text height enough to keep wrapped lines visible', () => {
    const layer = createTextLayer({
      text: 'alpha beta gamma delta epsilon',
      mode: 'box',
      width: 120,
      height: 36,
      boxWidth: 120,
      boxHeight: 36,
      fontSize: 32,
      lineHeight: 1.05,
    })

    const synced = syncTextLayerLayout({
      ...layer,
      width: 120,
      height: 36,
      boxWidth: 120,
      boxHeight: 36,
    }, layer)

    expect(synced.height).toBeGreaterThan(36)
    expect(synced.height).toBeGreaterThanOrEqual(synced.measuredHeight)
  })

  it('expands point text bounds to keep styled glyph overhang and spacing visible', () => {
    const layer = createTextLayer({
      mode: 'point',
      text: 'WAVY',
      fontSize: 84,
      fontStyle: 'italic',
      letterSpacing: 10,
      textAlign: 'left',
    })
    const measurement = measureTextLayer(layer)

    expect(measurement.paddingLeft).toBeGreaterThan(0)
    expect(measurement.paddingRight).toBeGreaterThan(0)
    expect(measurement.width).toBeGreaterThan(measurement.contentWidth)
  })

  it('grows safely when larger font sizes would otherwise clip ascenders and descenders', () => {
    const layer = createTextLayer({
      mode: 'point',
      text: 'Agjy',
      fontSize: 36,
    })
    const updated = updateTextStyle(layer, {
      fontSize: 112,
      lineHeight: 1,
    })

    expect(updated.height).toBeGreaterThan(layer.height)
    expect(updated.measuredHeight).toBeGreaterThan(layer.measuredHeight)
  })

  it('measures mixed-style text using the same safe bounds path', () => {
    const baseLayer = createTextLayer({
      mode: 'point',
      text: 'Hello world',
      fontSize: 32,
    })
    const mixedLayer = createTextLayer({
      mode: 'point',
      text: 'Hello world',
      fontSize: 32,
      styleRanges: [
        { start: 6, end: 11, styles: { fontSize: 72, fontWeight: 700 } },
      ],
    })

    expect(mixedLayer.measuredWidth).toBeGreaterThan(baseLayer.measuredWidth)
    expect(mixedLayer.measuredHeight).toBeGreaterThanOrEqual(baseLayer.measuredHeight)
  })

  it('renderTextLayerToCanvas uses the synced safe layer bounds', () => {
    const layer = createTextLayer({
      mode: 'point',
      text: 'Outline',
      fontSize: 72,
      textStrokeWidth: 8,
      textStrokeColor: '#000000',
    })
    const canvas = renderTextLayerToCanvas(layer)

    expect(canvas.width).toBe(layer.width)
    expect(canvas.height).toBe(layer.height)
  })

  it('keeps Arabic point text padding tight instead of inflating horizontal bounds', () => {
    const layer = createTextLayer({
      mode: 'point',
      text: '\u0645\u0631\u062d\u0628\u0627',
      fontSize: 42,
    })
    const measurement = measureTextLayer(layer)

    expect(measurement.paddingLeft).toBe(POINT_TEXT_PADDING_EXPECTED)
    expect(measurement.paddingRight).toBe(POINT_TEXT_PADDING_EXPECTED)
    expect(measurement.width - measurement.contentWidth).toBe(POINT_TEXT_PADDING_EXPECTED * 2)
  })

  it('keeps the visible Arabic point-text anchor stable when content changes', () => {
    const layer = createTextLayer({
      mode: 'point',
      text: '\u0645\u0631\u062d\u0628\u0627',
      x: 320,
      y: 480,
      textAlign: 'left',
    })
    const updated = updateTextContent(layer, '\u0645\u0631\u062d\u0628\u0627 \u0628\u0643\u0645')
    const previousTopLeft = centerToTopLeft(layer.x, layer.y, layer.width, layer.height)
    const updatedTopLeft = centerToTopLeft(updated.x, updated.y, updated.width, updated.height)

    expect(updatedTopLeft.x).toBe(previousTopLeft.x)
    expect(updated.y).toBe(layer.y)
  })

  it('keeps roomy exact JSON text boxes unchanged when they are already safe', () => {
    const layer = createExactTextLayerFromJsonSpec({
      text: 'Hello world',
      color: '#123456',
      bolded: true,
      font: 'Arial, sans-serif',
      size: 72,
      alignment: 'center',
      x: 400,
      y: 1000,
      width: 500,
      height: 200,
      addShadow: false,
      layerPlacement: 0,
    })
    const synced = syncTextLayerLayout(layer, layer)

    expect(synced.width).toBe(500)
    expect(synced.height).toBe(200)
  })

  it('expands exact JSON text boxes only when the requested size is too small to stay unclipped', () => {
    const layer = createExactTextLayerFromJsonSpec({
      text: 'This exact box is too small',
      color: '#123456',
      bolded: true,
      font: 'Arial, sans-serif',
      size: 96,
      alignment: 'left',
      x: 200,
      y: 300,
      width: 120,
      height: 60,
      addShadow: false,
      layerPlacement: 0,
    })
    const synced = syncTextLayerLayout(layer, layer)

    expect(synced.width).toBeGreaterThanOrEqual(120)
    expect(synced.height).toBeGreaterThan(60)
  })
})
