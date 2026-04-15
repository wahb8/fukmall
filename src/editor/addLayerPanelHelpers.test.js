import { describe, expect, it } from 'vitest'
import {
  applyExplicitImagePosition,
  applyInspectorSizeToLayer,
  createExactTextLayerFromJsonSpec,
  createImageLayerFromAddSpec,
  createTextLayerFromAddSpec,
  getDefaultImageLayerFormValues,
  getDefaultTextLayerFormValues,
  normalizeImageLayerSpec,
  resolveStoredLayerPosition,
  resolveStoredLayerSize,
  normalizeImageLayerSpecFromForm,
  normalizeJsonTextLayerSpec,
  normalizeTextLayerSpec,
  normalizeTextLayerSpecFromForm,
  parseAddLayerJson,
} from './addLayerPanelHelpers'
import { createTextLayer } from '../lib/layers'
import { syncTextLayerLayout } from '../lib/textLayer'

describe('addLayerPanel helpers', () => {
  it('parses valid JSON payloads and populates form values from the first specs', () => {
    const parsed = parseAddLayerJson(JSON.stringify({
      texts: [{
        text: 'Hello',
        color: '#111111',
        bolded: true,
        font: 'Arial, sans-serif',
        size: '72',
        alignment: 'center',
        x: '120',
        y: 180,
        width: '360',
        height: '140',
        addShadow: true,
        layerPlacement: '2',
      }],
      images: [{
        src: 'https://example.com/image.png',
        x: 100,
        y: '200',
        width: '400',
        height: 300,
        opacity: '0.5',
        rotation: '15',
        scaleX: '1.2',
        scaleY: 0.8,
        layerPlacement: 1,
      }],
    }))

    expect(parsed.error).toBeNull()
    expect(parsed.textSpecs).toEqual([{
      text: 'Hello',
      color: '#111111',
      bolded: true,
      font: 'Arial, sans-serif',
      size: 72,
      alignment: 'center',
      x: 120,
      y: 180,
      width: 360,
      height: 140,
      addShadow: true,
      layerPlacement: 2,
    }])
    expect(parsed.imageSpecs).toEqual([{
      src: 'https://example.com/image.png',
      x: 100,
      y: 200,
      width: 400,
      height: 300,
      opacity: 0.5,
      rotation: 15,
      scaleX: 1.2,
      scaleY: 0.8,
      layerPlacement: 1,
    }])
    expect(parsed.textFormValues.text).toBe('Hello')
    expect(parsed.imageFormValues.src).toBe('https://example.com/image.png')
  })

  it('preserves explicit JSON text values exactly through parse, normalization, and final creation', () => {
    const jsonPayload = `{
      "texts": [
        {
          "text": "Hello world",
          "color": "#123456",
          "bolded": true,
          "font": "Arial, sans-serif",
          "size": 72,
          "alignment": "center",
          "x": 400,
          "y": 1000,
          "width": 500,
          "height": 200,
          "addShadow": false,
          "layerPlacement": 0
        }
      ]
    }`
    const parsedObject = JSON.parse(jsonPayload)
    const normalizedSpec = normalizeJsonTextLayerSpec(parsedObject.texts[0])
    const parsed = parseAddLayerJson(jsonPayload)
    const layer = createExactTextLayerFromJsonSpec(parsed.textSpecs[0])

    expect(normalizedSpec).toEqual({
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
    expect(parsed.error).toBeNull()
    expect(parsed.textSpecs).toEqual([normalizedSpec])
    expect(layer.text).toBe('Hello world')
    expect(layer.color).toBe('#123456')
    expect(layer.fontFamily).toBe('Arial, sans-serif')
    expect(layer.fontSize).toBe(72)
    expect(layer.textAlign).toBe('center')
    expect(layer.fontWeight).toBe(700)
    expect(layer.x).toBe(400)
    expect(layer.y).toBe(1000)
    expect(layer.width).toBe(500)
    expect(layer.height).toBe(200)
  })

  it('returns a safe error for invalid JSON', () => {
    const parsed = parseAddLayerJson('{bad json')

    expect(parsed.error).toBe('This JSON payload could not be parsed.')
    expect(parsed.textSpecs).toEqual([])
    expect(parsed.imageSpecs).toEqual([])
  })

  it('falls back to current default form values when no valid specs exist', () => {
    const parsed = parseAddLayerJson(JSON.stringify({
      images: [{ src: '' }],
    }))

    expect(parsed.error).toBe('The JSON payload did not contain any valid text or image layer specs.')
    expect(parsed.textFormValues).toEqual(getDefaultTextLayerFormValues())
    expect(parsed.imageFormValues).toEqual(getDefaultImageLayerFormValues())
  })

  it('normalizes text specs conservatively and ignores unsupported values', () => {
    expect(normalizeTextLayerSpec({
      text: '',
      color: '#ff0000',
      bolded: false,
      font: 'Rubik, sans-serif',
      size: '48',
      alignment: 'right',
      x: '24.5',
      y: 'bad',
      width: '320',
      height: '0',
      addShadow: 'true',
      layerPlacement: '3',
      language: 'ar',
    })).toEqual({
      text: '',
      color: '#ff0000',
      bolded: false,
      font: 'Rubik, sans-serif',
      size: 48,
      alignment: 'right',
      x: 24.5,
      width: 320,
      addShadow: true,
      layerPlacement: 3,
    })

    expect(normalizeTextLayerSpecFromForm({
      text: 'Title',
      color: '#222222',
      bolded: true,
      font: 'Arial, sans-serif',
      size: '',
      alignment: 'center',
      x: '',
      y: '140',
      width: '340',
      height: '',
      addShadow: false,
      layerPlacement: '',
    })).toEqual({
      text: 'Title',
      color: '#222222',
      bolded: true,
      font: 'Arial, sans-serif',
      alignment: 'center',
      y: 140,
      width: 340,
      addShadow: false,
    })
  })

  it('normalizes image specs and rejects missing image sources', () => {
    expect(normalizeImageLayerSpec({
      src: ' https://example.com/test.png ',
      x: '12',
      y: 20,
      width: '400',
      height: 300,
      opacity: '0.75',
      rotation: '45',
      scaleX: '1',
      scaleY: 'bad',
      layerPlacement: '5',
    })).toEqual({
      src: 'https://example.com/test.png',
      x: 12,
      y: 20,
      width: 400,
      height: 300,
      opacity: 0.75,
      rotation: 45,
      scaleX: 1,
      layerPlacement: 5,
    })

    expect(normalizeImageLayerSpecFromForm({
      src: '',
      x: '100',
      y: '120',
      width: '',
      height: '',
      opacity: '1',
      rotation: '0',
      scaleX: '1',
      scaleY: '1',
      layerPlacement: '',
    })).toBeNull()
  })

  it('keeps explicit image document coordinates instead of centering them', () => {
    const storedPosition = resolveStoredLayerPosition({ x: 400, y: 1000 })
    const position = applyExplicitImagePosition(storedPosition, 300, 220, 1080, 1440)

    expect(position).toEqual({ x: 400, y: 1000 })
  })

  it('keeps explicit width and height as stored base dimensions even when scale is also provided', () => {
    const size = resolveStoredLayerSize({
      width: 400,
      height: 300,
      scaleX: 2,
      scaleY: 0.5,
    }, {
      width: 300,
      height: 220,
    }, {
      width: 72,
      height: 48,
    })

    expect(size).toEqual({
      width: 400,
      height: 300,
      hasExplicitWidth: true,
      hasExplicitHeight: true,
    })
  })

  it('falls back to intrinsic/default size only when width or height is omitted', () => {
    expect(resolveStoredLayerSize({}, { width: 512, height: 256 }, { width: 72, height: 48 })).toEqual({
      width: 512,
      height: 256,
      hasExplicitWidth: false,
      hasExplicitHeight: false,
    })
    expect(resolveStoredLayerSize(
      { width: 400 },
      { width: 512, height: 256 },
      { width: 72, height: 48 },
    )).toEqual({
      width: 400,
      height: 256,
      hasExplicitWidth: true,
      hasExplicitHeight: false,
    })
  })

  it('clamps explicit stored width and height to the same minimums the inspector uses', () => {
    const size = resolveStoredLayerSize(
      { width: 10, height: 12 },
      { width: 280, height: 96 },
      { width: 72, height: 48 },
    )

    expect(size).toEqual({
      width: 72,
      height: 48,
      hasExplicitWidth: true,
      hasExplicitHeight: true,
    })
  })

  it('stores text x and y exactly for left alignment', () => {
    const position = resolveStoredLayerPosition({ x: 400, y: 1000 }, { x: 220, y: 140 })

    expect(position).toEqual({
      x: 400,
      y: 1000,
      hasExplicitX: true,
      hasExplicitY: true,
    })
  })

  it('stores text x and y exactly for center and right alignment too', () => {
    expect(resolveStoredLayerPosition({ x: 400, y: 1000 }, { x: 120, y: 80 })).toEqual({
      x: 400,
      y: 1000,
      hasExplicitX: true,
      hasExplicitY: true,
    })
    expect(resolveStoredLayerPosition({ x: 400, y: 1000 }, { x: 600, y: 320 })).toEqual({
      x: 400,
      y: 1000,
      hasExplicitX: true,
      hasExplicitY: true,
    })
  })

  it('does not apply preview-space scaling to requested document coordinates', () => {
    const requestedPosition = resolveStoredLayerPosition({ x: 400, y: 1000 })

    expect(requestedPosition.x).toBe(400)
    expect(requestedPosition.y).toBe(1000)
  })

  it('does not apply preview-space scaling or post-scale conversion to width and height', () => {
    const size = resolveStoredLayerSize(
      { width: 400, height: 300 },
      { width: 280, height: 96 },
      { width: 72, height: 48 },
    )

    expect(size.width).toBe(400)
    expect(size.height).toBe(300)
  })

  it('creates an image layer with explicit stored width/height and separate scale fields', async () => {
    const layer = await createImageLayerFromAddSpec(
      {
        src: 'https://example.com/image.png',
        x: 400,
        y: 1000,
        width: 400,
        height: 300,
        scaleX: 2,
        scaleY: 0.5,
      },
      {
        loadImageDimensions: async () => ({ width: 999, height: 888 }),
        documentWidth: 1080,
        documentHeight: 1440,
      },
    )

    expect(layer.x).toBe(400)
    expect(layer.y).toBe(1000)
    expect(layer.width).toBe(400)
    expect(layer.height).toBe(300)
    expect(layer.scaleX).toBe(2)
    expect(layer.scaleY).toBe(0.5)
  })

  it('uses intrinsic image dimensions only when width/height are omitted', async () => {
    const layer = await createImageLayerFromAddSpec(
      {
        src: 'https://example.com/image.png',
      },
      {
        loadImageDimensions: async () => ({ width: 410, height: 305 }),
        documentWidth: 1080,
        documentHeight: 1440,
      },
    )

    expect(layer.width).toBe(410)
    expect(layer.height).toBe(305)
  })

  it('creates text layers with the same final width/height semantics the inspector uses', () => {
    const baseLayer = createTextLayer({
      text: 'Hello world',
      fontFamily: 'Arial, sans-serif',
      fontSize: 42,
      textAlign: 'left',
      x: 400,
      y: 1000,
    })
    const inspectorSizedLayer = applyInspectorSizeToLayer(baseLayer, {
      width: 360,
      height: 140,
    })
    const createdLayer = createTextLayerFromAddSpec({
      text: 'Hello world',
      font: 'Arial, sans-serif',
      size: 42,
      alignment: 'left',
      x: 400,
      y: 1000,
      width: 360,
      height: 140,
    })

    expect(createdLayer.x).toBe(400)
    expect(createdLayer.y).toBe(1000)
    expect(createdLayer.width).toBe(inspectorSizedLayer.width)
    expect(createdLayer.height).toBe(inspectorSizedLayer.height)
  })

  it('creates JSON text layers with exact final fields from the JSON spec', () => {
    const layer = createExactTextLayerFromJsonSpec({
      text: 'Hello',
      x: 400,
      y: 1000,
      width: 500,
      height: 200,
      font: 'Arial, sans-serif',
      size: 72,
      alignment: 'center',
      bolded: true,
      color: '#111111',
    })

    expect(layer.text).toBe('Hello')
    expect(layer.x).toBe(400)
    expect(layer.y).toBe(1000)
    expect(layer.width).toBe(500)
    expect(layer.height).toBe(200)
    expect(layer.boxWidth).toBe(500)
    expect(layer.boxHeight).toBe(200)
    expect(layer.fontFamily).toBe('Arial, sans-serif')
    expect(layer.fontSize).toBe(72)
    expect(layer.textAlign).toBe('center')
    expect(layer.fontWeight).toBe(700)
    expect(layer.color).toBe('#111111')
    expect(layer.mode).toBe('box')
  })

  it('preserves exact JSON text width and height even if layout sync runs again after creation', () => {
    const finalLayer = createExactTextLayerFromJsonSpec({
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
    const syncedLayer = syncTextLayerLayout(finalLayer, finalLayer)

    expect(finalLayer.width).toBe(500)
    expect(finalLayer.height).toBe(200)
    expect(syncedLayer.width).toBe(500)
    expect(syncedLayer.height).toBe(200)
  })
})
