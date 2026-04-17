import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFloatingSelection,
  finalizeLassoSelection,
  getFloatingSelectionSourceOffset,
} from './lassoTool'

function createMockContext() {
  return {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    save() {},
    restore() {},
    clip() {},
    drawImage() {},
  }
}

describe('lassoTool', () => {
  beforeEach(() => {
    vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((contextType) => {
        if (contextType !== '2d') {
          return null
        }

        return createMockContext()
      })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a floating selection with the expected initial document origin', () => {
    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = 100
    sourceCanvas.height = 80

    const selection = finalizeLassoSelection([
      { x: 10, y: 15 },
      { x: 20, y: 15 },
      { x: 20, y: 25 },
      { x: 10, y: 25 },
    ])

    const floatingSelection = createFloatingSelection(
      {
        id: 'layer-1',
        x: 140,
        y: 130,
        width: 200,
        height: 160,
      },
      sourceCanvas,
      selection,
      'move',
    )

    expect(floatingSelection).toMatchObject({
      x: 60,
      y: 80,
      width: 20,
      height: 20,
      scaleX: 2,
      scaleY: 2,
    })
  })

  it('maps a floating selection back into source-canvas coordinates from the layer top-left', () => {
    const layer = {
      id: 'layer-1',
      x: 140,
      y: 130,
      width: 200,
      height: 160,
    }
    const floatingSelection = {
      x: 90,
      y: 120,
      scaleX: 2,
      scaleY: 2,
    }

    expect(getFloatingSelectionSourceOffset(layer, floatingSelection)).toEqual({
      x: 25,
      y: 35,
    })
  })
})
