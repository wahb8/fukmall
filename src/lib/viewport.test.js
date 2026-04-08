import { describe, expect, it } from 'vitest'
import { clampZoom, screenToWorld, worldToScreen, zoomAtPoint } from './viewport'

describe('viewport helpers', () => {
  it('clamps zoom to the provided bounds', () => {
    expect(clampZoom(0.2, 0.5, 2)).toBe(0.5)
    expect(clampZoom(3, 0.5, 2)).toBe(2)
    expect(clampZoom(1.25, 0.5, 2)).toBe(1.25)
  })

  it('converts between screen and world coordinates', () => {
    const viewport = { zoom: 2, offsetX: 10, offsetY: 20 }

    expect(screenToWorld(30, 60, viewport)).toEqual({ x: 10, y: 20 })
    expect(worldToScreen(10, 20, viewport)).toEqual({ x: 30, y: 60 })
  })

  it('zooms around a point while keeping that world point stable', () => {
    const viewport = { zoom: 1, offsetX: 5, offsetY: 10 }

    const nextViewport = zoomAtPoint(viewport, 105, 210, 2, 0.5, 4)
    const before = screenToWorld(105, 210, viewport)
    const after = screenToWorld(105, 210, nextViewport)

    expect(nextViewport.zoom).toBe(2)
    expect(after).toEqual(before)
  })
})
