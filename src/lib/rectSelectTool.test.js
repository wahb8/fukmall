import { describe, expect, it } from 'vitest'
import {
  clearRectSelection,
  createRectFromPoints,
  extractRectSelection,
  rectToBounds,
} from './rectSelectTool'

describe('rectSelectTool', () => {
  it('normalizes rectangles from any drag direction', () => {
    expect(createRectFromPoints({ x: 20, y: 40 }, { x: 10, y: 15 })).toEqual({
      x: 10,
      y: 15,
      width: 10,
      height: 25,
    })
  })

  it('converts a rect to integer bounds', () => {
    expect(rectToBounds({ x: 10.2, y: 5.1, width: 4.7, height: 3.2 })).toEqual({
      left: 10,
      top: 5,
      right: 15,
      bottom: 9,
      width: 5,
      height: 4,
    })
  })

  it('extracts and clears a rectangular region from a canvas', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 6
    canvas.height = 6
    const context = canvas.getContext('2d')

    context.fillStyle = '#ff0000'
    context.fillRect(0, 0, 6, 6)

    const extracted = extractRectSelection(canvas, { x: 1, y: 2, width: 3, height: 2 })
    const extractedContext = extracted.getContext('2d')
    const extractedPixel = extractedContext.getImageData(1, 0, 1, 1).data

    expect(extracted.width).toBe(3)
    expect(extracted.height).toBe(2)
    expect(extractedPixel[0]).toBe(255)
    expect(extractedPixel[3]).toBe(255)

    clearRectSelection(canvas, { x: 1, y: 2, width: 3, height: 2 })

    const clearedPixel = context.getImageData(2, 3, 1, 1).data
    const untouchedPixel = context.getImageData(0, 0, 1, 1).data

    expect(clearedPixel[3]).toBe(0)
    expect(untouchedPixel[0]).toBe(255)
    expect(untouchedPixel[3]).toBe(255)
  })
})
