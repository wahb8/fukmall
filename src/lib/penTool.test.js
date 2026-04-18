import { describe, expect, it, vi } from 'vitest'
import {
  appendStrokePoint,
  drawDot,
  drawSmoothStroke,
  drawStroke,
  getSmoothedStrokePoints,
  hasStrokeMovedBeyondThreshold,
} from './penTool'

function createContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    quadraticCurveTo: vi.fn(),
  }
}

describe('penTool', () => {
  it('avoids appending points that do not clear the minimum distance', () => {
    const firstPoint = { x: 10, y: 10 }
    const points = appendStrokePoint([], firstPoint, 4)
    const unchanged = appendStrokePoint(points, { x: 12, y: 11 }, 4)
    const appended = appendStrokePoint(points, { x: 16, y: 16 }, 4)

    expect(unchanged).toBe(points)
    expect(appended).toEqual([firstPoint, { x: 16, y: 16 }])
  })

  it('detects when a stroke has moved beyond the drag threshold', () => {
    expect(hasStrokeMovedBeyondThreshold([{ x: 0, y: 0 }], 5)).toBe(false)
    expect(hasStrokeMovedBeyondThreshold([{ x: 0, y: 0 }, { x: 3, y: 4 }], 5)).toBe(true)
  })

  it('returns a smoothed path for longer strokes while preserving endpoints', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 10 },
      { x: 30, y: 15 },
      { x: 40, y: 20 },
    ]
    const smoothed = getSmoothedStrokePoints(points, 24)

    expect(smoothed.length).toBeGreaterThan(points.length)
    expect(smoothed[0]).toEqual(points[0])
    expect(smoothed.at(-1)).toEqual(points.at(-1))
  })

  it('draws straight strokes and dots using the provided brush style', () => {
    const context = createContext()

    drawStroke(context, 1, 2, 3, 4, '#ff0000', 8)
    drawDot(context, 5, 6, '#00ff00', 10)

    expect(context.save).toHaveBeenCalledTimes(2)
    expect(context.restore).toHaveBeenCalledTimes(2)
    expect(context.moveTo).toHaveBeenCalledWith(1, 2)
    expect(context.lineTo).toHaveBeenCalledWith(3, 4)
    expect(context.arc).toHaveBeenCalledWith(5, 6, 5, 0, Math.PI * 2)
  })

  it('renders a quadratic smoothed stroke for multi-point paths', () => {
    const context = createContext()
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
      { x: 30, y: 10 },
    ]

    drawSmoothStroke(context, points, '#111111', 12)

    expect(context.moveTo).toHaveBeenCalledWith(0, 0)
    expect(context.quadraticCurveTo).toHaveBeenCalledTimes(2)
    expect(context.stroke).toHaveBeenCalledTimes(1)
    expect(context.restore).toHaveBeenCalledTimes(1)
  })
})
