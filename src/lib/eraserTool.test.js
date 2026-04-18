import { describe, expect, it, vi } from 'vitest'
import { eraseDot, eraseStroke, paintMaskDot, paintMaskStroke } from './eraserTool'

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
  }
}

describe('eraserTool', () => {
  it('uses destination-out when erasing strokes and dots', () => {
    const context = createContext()

    eraseStroke(context, 1, 2, 3, 4, 12)
    eraseDot(context, 5, 6, 10)

    expect(context.globalCompositeOperation).toBe('destination-out')
    expect(context.moveTo).toHaveBeenCalledWith(1, 2)
    expect(context.lineTo).toHaveBeenCalledWith(3, 4)
    expect(context.arc).toHaveBeenCalledWith(5, 6, 5, 0, Math.PI * 2)
    expect(context.restore).toHaveBeenCalledTimes(2)
  })

  it('uses source-over when painting mask strokes and dots', () => {
    const context = createContext()

    paintMaskStroke(context, 10, 20, 30, 40, 14)
    expect(context.globalCompositeOperation).toBe('source-over')
    expect(context.moveTo).toHaveBeenCalledWith(10, 20)
    expect(context.lineTo).toHaveBeenCalledWith(30, 40)

    paintMaskDot(context, 15, 25, 8)
    expect(context.globalCompositeOperation).toBe('source-over')
    expect(context.arc).toHaveBeenCalledWith(15, 25, 4, 0, Math.PI * 2)
  })
})
