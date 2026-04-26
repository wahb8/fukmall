import { describe, expect, it } from 'vitest'
import {
  clampZoom,
  getFittedStageMetrics,
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
} from './viewport'

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

  it('fits stage metrics to the active document aspect ratio', () => {
    expect(getFittedStageMetrics(1000, 1000, 428, 570)).toEqual({
      width: 428,
      height: 428,
      scale: 0.428,
    })

    const wideStage = getFittedStageMetrics(1600, 900, 428, 570)

    expect(wideStage.width).toBeCloseTo(428)
    expect(wideStage.height).toBeCloseTo(240.75)
    expect(wideStage.scale).toBeCloseTo(0.2675)

    const tallStage = getFittedStageMetrics(900, 1600, 428, 570)

    expect(tallStage.width).toBeCloseTo(320.625)
    expect(tallStage.height).toBeCloseTo(570)
    expect(tallStage.scale).toBeCloseTo(0.35625)
  })
})
