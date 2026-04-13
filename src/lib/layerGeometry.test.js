import { describe, expect, it } from 'vitest'
import {
  centerToTopLeft,
  getLayerTopLeft,
  getLayerTransformBounds,
  getScaledLayerSize,
  normalizeLayerCenterPosition,
  toLayerLocalPoint,
  topLeftToCenter,
} from './layerGeometry'

describe('layer geometry helpers', () => {
  it('converts between top-left and center coordinates', () => {
    expect(topLeftToCenter(10, 20, 100, 50)).toEqual({ x: 60, y: 45 })
    expect(centerToTopLeft(60, 45, 100, 50)).toEqual({ x: 10, y: 20 })
  })

  it('derives top-left from center-based layer geometry', () => {
    expect(getLayerTopLeft({
      x: 100,
      y: 80,
      width: 40,
      height: 20,
    })).toEqual({ x: 80, y: 70 })
  })

  it('computes scaled size from base size and scale', () => {
    expect(getScaledLayerSize({
      width: 40,
      height: 20,
      scaleX: 2,
      scaleY: -3,
    })).toEqual({ width: 80, height: 60 })
  })

  it('converts legacy top-left stored layers into center-based layers', () => {
    expect(normalizeLayerCenterPosition({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    })).toMatchObject({ x: 60, y: 45 })
  })

  it('maps document points into local layer space using center coordinates', () => {
    const point = toLayerLocalPoint(
      { x: 100, y: 100, width: 40, height: 20, scaleX: 1, scaleY: 1, rotation: 0 },
      { x: 80, y: 90 },
    )

    expect(point).toEqual({ x: 0, y: 0 })
  })

  it('computes rotated transform bounds from center coordinates', () => {
    const bounds = getLayerTransformBounds({
      x: 50,
      y: 50,
      width: 20,
      height: 10,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    })

    expect(bounds).toEqual({
      minX: 40,
      minY: 45,
      maxX: 60,
      maxY: 55,
    })
  })
})
