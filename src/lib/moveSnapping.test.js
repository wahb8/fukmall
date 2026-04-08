import { describe, expect, it } from 'vitest'
import { applyMoveSnapping, createEmptySnapGuides, DEFAULT_SNAP_THRESHOLD } from './moveSnapping'

describe('move snapping helpers', () => {
  it('creates an empty guides object', () => {
    expect(createEmptySnapGuides()).toEqual({
      showVerticalCenter: false,
      showHorizontalCenter: false,
      showLeftEdge: false,
      showRightEdge: false,
      showTopEdge: false,
      showBottomEdge: false,
    })
  })

  it('snaps to document center and returns center guides', () => {
    const result = applyMoveSnapping(44, 44, 12, 12, 100, 100, {
      enabled: true,
      threshold: DEFAULT_SNAP_THRESHOLD,
    })

    expect(result.x).toBe(44)
    expect(result.y).toBe(44)
    expect(result.guides.showVerticalCenter).toBe(true)
    expect(result.guides.showHorizontalCenter).toBe(true)
  })

  it('snaps to outer edges', () => {
    const result = applyMoveSnapping(3, 4, 20, 20, 100, 100, {
      enabled: true,
      threshold: DEFAULT_SNAP_THRESHOLD,
    })

    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.guides.showLeftEdge).toBe(true)
    expect(result.guides.showTopEdge).toBe(true)
  })

  it('respects axis-specific snapping enablement', () => {
    const result = applyMoveSnapping(4, 44, 12, 12, 100, 100, {
      enabled: true,
      enabledX: false,
      enabledY: true,
      threshold: DEFAULT_SNAP_THRESHOLD,
    })

    expect(result.x).toBe(4)
    expect(result.guides.showLeftEdge).toBe(false)
    expect(result.y).toBe(44)
    expect(result.guides.showHorizontalCenter).toBe(true)
  })
})
