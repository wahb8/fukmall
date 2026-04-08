import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createGroupLayer,
  createShapeLayer,
} from './layers'
import { normalizeDocumentState, parseProjectFile, serializeProjectFile } from './documentFiles'

describe('document file helpers', () => {
  it('normalizes document state by stripping group layers and repairing selection', () => {
    const group = createGroupLayer({ id: 'group' })
    const shape = createShapeLayer({ id: 'shape' })

    const normalized = normalizeDocumentState({
      name: '  ',
      width: 0,
      height: 'bad',
      layers: [group, shape],
      selectedLayerId: 'missing',
      selectedLayerIds: ['missing'],
    })

    expect(normalized.name).toBe('Untitled')
    expect(normalized.width).toBe(1)
    expect(normalized.height).toBe(1440)
    expect(normalized.layers.map((layer) => layer.id)).toEqual(['shape'])
    expect(normalized.selectedLayerId).toBe('shape')
    expect(normalized.selectedLayerIds).toEqual(['shape'])
  })

  it('repairs invalid linked-layer references during normalization', () => {
    const first = createShapeLayer({ id: 'first', linkedLayerId: 'second' })
    const second = createShapeLayer({ id: 'second', linkedLayerId: null })

    const normalized = normalizeDocumentState(createDocument([first, second], 'first'))

    expect(normalized.layers.every((layer) => layer.linkedLayerId === null)).toBe(true)
  })

  it('serializes app metadata and parses the normalized document back out', () => {
    const documentState = createDocument([createShapeLayer({ id: 'shape' })], 'shape')

    const serialized = serializeProjectFile(documentState)
    const parsedFile = JSON.parse(serialized)
    const parsedDocument = parseProjectFile(serialized)

    expect(parsedFile.app).toBe('Fukmall')
    expect(parsedFile.version).toBe(1)
    expect(parsedDocument.selectedLayerId).toBe('shape')
    expect(parsedDocument.layers).toHaveLength(1)
  })

  it('rejects unsupported project metadata', () => {
    expect(() => parseProjectFile('{"app":"Other","version":1,"document":{}}')).toThrow(
      'This file is not a Fukmall project file.',
    )
    expect(() => parseProjectFile('{"app":"Fukmall","version":99,"document":{}}')).toThrow(
      'This Fukmall project version is not supported.',
    )
  })
})
