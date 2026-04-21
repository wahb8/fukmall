import { describe, expect, it } from 'vitest'
import { createShapeLayer } from '../lib/layers'
import {
  clampImportedImagePosition,
  createValidatedImportedImageLayer,
  createBitmapEditableLayerPatch,
  createImageLayerBitmapPatch,
  createInitialDocument,
  getDefaultImportedImagePosition,
  getDocumentFilenameBase,
  getImportedImageDimensions,
  normalizeNewFileDimensionInput,
  normalizeNewFileNameInput,
  shouldTrimTransparentImport,
} from './documentHelpers'

describe('document helpers', () => {
  it('creates the seeded initial document shape', () => {
    const documentState = createInitialDocument()

    expect(documentState.layers).toHaveLength(4)
    expect(documentState.layers[0].name).toBe('Background')
    expect(documentState.layers[0].type).toBe('raster')
    expect(documentState.layers[0].bitmap).toMatch(/^data:image\/png/)
    expect(documentState.layers[1].name).toBe('Hero Image')
    expect(documentState.selectedLayerId).toBe(documentState.layers[1].id)
  })

  it('normalizes new-file name and dimensions safely', () => {
    expect(normalizeNewFileNameInput('   ', 'Fallback')).toBe('Fallback')
    expect(normalizeNewFileDimensionInput('25.7', 100)).toBe(26)
    expect(normalizeNewFileDimensionInput('bad', 100)).toBe(100)
  })

  it('sanitizes save and export filename bases', () => {
    expect(getDocumentFilenameBase('  my:file*name  ', 'fallback')).toBe('my-file-name')
    expect(getDocumentFilenameBase('\u0000', 'fallback')).toBe('fallback')
  })

  it('clamps imported image placement into the document bounds', () => {
    expect(clampImportedImagePosition(-10, 30, 100, 50, 500, 500)).toEqual({ x: 0, y: 30 })
    expect(getDefaultImportedImagePosition(200, 100, 1080, 1440)).toEqual({ x: 440, y: 670 })
  })

  it('rejects invalid imported image dimensions instead of returning NaN values', () => {
    expect(getImportedImageDimensions(undefined, 120)).toBeNull()
    expect(getImportedImageDimensions(120, 0)).toBeNull()
    expect(getImportedImageDimensions(120.4, 240.6)).toEqual({ width: 120, height: 241 })
  })

  it('creates validated imported image layers with clamped placement and normalized source kind', () => {
    const layer = createValidatedImportedImageLayer({
      name: 'Imported',
      src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
      width: 240,
      height: 180,
      documentWidth: 300,
      documentHeight: 200,
      topLeftX: 200,
      topLeftY: 90,
      sourceKind: 'svg',
    })

    expect(layer.type).toBe('image')
    expect(layer.sourceKind).toBe('svg')
    expect(layer.width).toBe(240)
    expect(layer.height).toBe(180)
    expect(layer.x).toBe(180)
    expect(layer.y).toBe(110)
  })

  it('only enables transparent-edge trimming for eligible raster imports', () => {
    expect(shouldTrimTransparentImport({
      enabled: true,
      sourceKind: 'svg',
      formatHint: 'svg',
      src: 'data:image/svg+xml,<svg />',
    })).toBe(false)
    expect(shouldTrimTransparentImport({
      enabled: true,
      sourceKind: 'bitmap',
      formatHint: 'jpeg',
      src: 'data:image/jpeg;base64,abc',
    })).toBe(false)
    expect(shouldTrimTransparentImport({
      enabled: true,
      sourceKind: 'bitmap',
      formatHint: 'png',
      src: 'data:image/png;base64,abc',
    })).toBe(true)
  })

  it('creates deterministic bitmap-backed layer patches', () => {
    const shapeLayer = createShapeLayer({ name: 'Shape' })
    const imagePatch = createImageLayerBitmapPatch({ type: 'image' }, 'bitmap-data')
    const editablePatch = createBitmapEditableLayerPatch(shapeLayer, 'bitmap-data')

    expect(imagePatch).toEqual({
      src: 'bitmap-data',
      bitmap: 'bitmap-data',
      sourceKind: 'bitmap',
    })
    expect(editablePatch.type).toBe('image')
    expect(editablePatch.bitmap).toBe('bitmap-data')
    expect(editablePatch.fit).toBe('fill')
  })
})
