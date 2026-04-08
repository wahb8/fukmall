import { describe, expect, it } from 'vitest'
import { createShapeLayer } from '../lib/layers'
import {
  clampImportedImagePosition,
  createBitmapEditableLayerPatch,
  createImageLayerBitmapPatch,
  createInitialDocument,
  getDefaultImportedImagePosition,
  getDocumentFilenameBase,
  normalizeNewFileDimensionInput,
  normalizeNewFileNameInput,
} from './documentHelpers'

describe('document helpers', () => {
  it('creates the seeded initial document shape', () => {
    const documentState = createInitialDocument()

    expect(documentState.layers).toHaveLength(4)
    expect(documentState.layers[0].name).toBe('Background')
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
