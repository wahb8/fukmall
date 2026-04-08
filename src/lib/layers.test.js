import { describe, expect, it } from 'vitest'
import {
  appendLayer,
  canMergeDown,
  createDocument,
  createGroupLayer,
  createImageLayer,
  createRasterLayer,
  createShapeLayer,
  createTextLayer,
  duplicateLayer,
  insertLayer,
  linkLayerPair,
  normalizeLinkedLayerReferences,
  removeLayer,
  removeLayers,
  selectSingleLayer,
  unlinkLayerPair,
} from './layers'

describe('layer helpers', () => {
  it('creates text layers with current default structured text state', () => {
    const layer = createTextLayer()

    expect(layer.type).toBe('text')
    expect(layer.mode).toBe('box')
    expect(layer.textAlign).toBe('left')
    expect(layer.boxWidth).toBe(layer.width)
    expect(layer.boxHeight).toBe(layer.height)
  })

  it('appends and inserts layers while selecting the inserted layer', () => {
    const base = createDocument([createShapeLayer({ name: 'Base' })])
    const appended = appendLayer(base, createRasterLayer({ name: 'Draw' }))
    const insertedLayer = createImageLayer({ name: 'Inserted' })
    const inserted = insertLayer(appended, insertedLayer, base.layers[0].id)

    expect(appended.layers).toHaveLength(2)
    expect(appended.selectedLayerId).toBe(appended.layers[1].id)
    expect(inserted.layers[1].id).toBe(insertedLayer.id)
    expect(inserted.selectedLayerId).toBe(insertedLayer.id)
  })

  it('duplicates a layer with a new id and inserted position', () => {
    const source = createShapeLayer({ name: 'Card' })
    const documentState = createDocument([source], source.id)

    const duplicated = duplicateLayer(documentState, source.id)

    expect(duplicated.layers).toHaveLength(2)
    expect(duplicated.layers[1].name).toBe('Card Copy')
    expect(duplicated.layers[1].id).not.toBe(source.id)
    expect(duplicated.selectedLayerId).toBe(duplicated.layers[1].id)
  })

  it('normalizes linked-layer references to reciprocal pairs only', () => {
    const first = createShapeLayer({ id: 'a', linkedLayerId: 'b' })
    const second = createShapeLayer({ id: 'b', linkedLayerId: 'a' })
    const broken = createShapeLayer({ id: 'c', linkedLayerId: 'a' })

    const normalized = normalizeLinkedLayerReferences([first, second, broken])

    expect(normalized.find((layer) => layer.id === 'a')?.linkedLayerId).toBe('b')
    expect(normalized.find((layer) => layer.id === 'b')?.linkedLayerId).toBe('a')
    expect(normalized.find((layer) => layer.id === 'c')?.linkedLayerId).toBeNull()
  })

  it('links and unlinks two selected layers', () => {
    const first = createShapeLayer({ id: 'first' })
    const second = createShapeLayer({ id: 'second' })
    const third = createShapeLayer({ id: 'third', linkedLayerId: 'first' })
    const documentState = createDocument([first, second, third], first.id)

    const linked = linkLayerPair(documentState, 'first', 'second')
    expect(linked.layers.find((layer) => layer.id === 'first')?.linkedLayerId).toBe('second')
    expect(linked.layers.find((layer) => layer.id === 'second')?.linkedLayerId).toBe('first')
    expect(linked.layers.find((layer) => layer.id === 'third')?.linkedLayerId).toBeNull()

    const unlinked = unlinkLayerPair(linked, 'first')
    expect(unlinked.layers.every((layer) => !layer.linkedLayerId)).toBe(true)
  })

  it('clears a surviving linked-layer reference when one linked layer is deleted', () => {
    const first = createShapeLayer({ id: 'first', linkedLayerId: 'second' })
    const second = createShapeLayer({ id: 'second', linkedLayerId: 'first' })
    const documentState = createDocument([first, second], first.id)

    const nextState = removeLayer(documentState, 'first')

    expect(nextState.layers).toHaveLength(1)
    expect(nextState.layers[0].id).toBe('second')
    expect(nextState.layers[0].linkedLayerId).toBeNull()
    expect(nextState.selectedLayerId).toBe('second')
  })

  it('keeps a valid fallback selection when selected layers are removed', () => {
    const first = createShapeLayer({ id: 'first' })
    const second = createShapeLayer({ id: 'second' })
    const third = createShapeLayer({ id: 'third' })
    const selected = selectSingleLayer(createDocument([first, second, third], second.id), third.id)

    const nextState = removeLayers(
      {
        ...selected,
        selectedLayerId: 'third',
        selectedLayerIds: ['second', 'third'],
      },
      ['second', 'third'],
    )

    expect(nextState.selectedLayerId).toBe('first')
    expect(nextState.selectedLayerIds).toEqual(['first'])
  })

  it('preserves SVG merge restrictions in merge-down eligibility', () => {
    const bottom = createImageLayer({ id: 'bottom', sourceKind: 'bitmap' })
    const svg = createImageLayer({ id: 'svg', sourceKind: 'svg' })
    const group = createGroupLayer()
    const documentState = createDocument([bottom, svg, group], svg.id)

    expect(canMergeDown(documentState, 'svg')).toBe(false)
    expect(canMergeDown(createDocument([svg, bottom], bottom.id), bottom.id)).toBe(false)
  })
})
