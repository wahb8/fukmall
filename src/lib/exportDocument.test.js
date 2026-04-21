import { describe, expect, it } from 'vitest'
import { renderDocumentToCanvas } from './exportDocument'
import { createDocument, createTextLayer } from './layers'
import { measureTextLayer } from './textLayer'

describe('export document text rendering', () => {
  it('exports Arabic text layers through the shared text canvas pipeline', async () => {
    const textLayer = createTextLayer({
      mode: 'point',
      text: '\u0645\u0631\u062d\u0628\u0627\n\u0628\u0627\u0644\u0639\u0627\u0644\u0645',
      visible: true,
      opacity: 1,
    })
    const documentState = createDocument([textLayer], textLayer.id)
    const measurement = measureTextLayer(textLayer)
    const canvas = await renderDocumentToCanvas(documentState, 1080, 1440, 'png')

    expect(measurement.layoutLines[0]?.direction).toBe('rtl')
    expect(measurement.layoutLines[1]?.direction).toBe('rtl')
    expect(measurement.lines).toEqual(['\u0645\u0631\u062d\u0628\u0627', '\u0628\u0627\u0644\u0639\u0627\u0644\u0645'])
    expect(canvas.width).toBe(1080)
    expect(canvas.height).toBe(1440)
  })
})
