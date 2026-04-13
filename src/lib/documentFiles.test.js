import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createGroupLayer,
  createShapeLayer,
  createTextLayer,
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
    expect(parsedFile.version).toBe(2)
    expect(parsedDocument.selectedLayerId).toBe('shape')
    expect(parsedDocument.layers).toHaveLength(1)
  })

  it('preserves normalized text style ranges through save and load', () => {
    const textLayer = createTextLayer({
      id: 'text',
      text: 'Hello world',
      styleRanges: [
        { start: 0, end: 5, styles: { color: '#ff0000' } },
        { start: 5, end: 11, styles: { color: '#ff0000' } },
      ],
    })
    const documentState = createDocument([textLayer], 'text')
    const parsedDocument = parseProjectFile(serializeProjectFile(documentState))

    expect(parsedDocument.layers[0].styleRanges).toEqual([
      { start: 0, end: 11, styles: { color: '#ff0000' } },
    ])
  })

  it('rejects unsupported project metadata', () => {
    expect(() => parseProjectFile('{"app":"Other","version":1,"document":{}}')).toThrow(
      'This file is not a Fukmall project file.',
    )
    expect(() => parseProjectFile('{"app":"Fukmall","version":99,"document":{}}')).toThrow(
      'This Fukmall project version is not supported.',
    )
  })

  it('migrates version 1 top-left layer positions to center-based positions', () => {
    const parsedDocument = parseProjectFile(JSON.stringify({
      app: 'Fukmall',
      version: 1,
      document: {
        name: 'Legacy',
        width: 100,
        height: 100,
        layers: [{
          id: 'shape',
          type: 'shape',
          name: 'Shape',
          visible: true,
          opacity: 1,
          x: 10,
          y: 20,
          width: 30,
          height: 40,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          linkedLayerId: null,
          lockTransparentPixels: false,
          fill: '#ff7a59',
          radius: 0,
        }],
        selectedLayerId: 'shape',
        selectedLayerIds: ['shape'],
      },
    }))

    expect(parsedDocument.layers[0]).toMatchObject({
      x: 25,
      y: 40,
    })
  })
})
