import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditorToolbar } from './EditorToolbar'

function createToolbarProps(overrides = {}) {
  return {
    currentTool: 'pen',
    activeBrushTool: 'pen',
    penSize: 16,
    eraserSize: 28,
    bucketTolerance: 200,
    gradientMode: 'bg-to-fg',
    hasFloatingSelection: false,
    hasActiveLassoSelection: false,
    canUndo: true,
    canRedo: false,
    toolPanelError: { message: '', isVisible: false, isFading: false },
    globalColors: { foreground: '#111111', background: '#ffffff' },
    onActivateTool: vi.fn(),
    onResetViewport: vi.fn(),
    onPenSizeChange: vi.fn(),
    onEraserSizeChange: vi.fn(),
    onBucketToleranceChange: vi.fn(),
    onGradientModeChange: vi.fn(),
    onCommitFloatingSelectionToNewLayer: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onAddText: vi.fn(),
    onAddImage: vi.fn(),
    onBackgroundChange: vi.fn(),
    onForegroundChange: vi.fn(),
    onSwapColors: vi.fn(),
    onResetColors: vi.fn(),
    ...overrides,
  }
}

describe('EditorToolbar', () => {
  it('renders tool controls and invokes key callbacks', () => {
    const props = createToolbarProps()

    render(<EditorToolbar {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Zoom' }))
    fireEvent.change(screen.getByRole('slider'), { target: { value: '22' } })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Image' }))
    fireEvent.click(screen.getByRole('button', { name: 'Swap foreground and background colors' }))

    expect(props.onActivateTool).toHaveBeenCalledWith('select')
    expect(props.onResetViewport).toHaveBeenCalledTimes(1)
    expect(props.onPenSizeChange).toHaveBeenCalledWith(22)
    expect(props.onUndo).toHaveBeenCalledTimes(1)
    expect(props.onAddText).toHaveBeenCalledTimes(1)
    expect(props.onAddImage).toHaveBeenCalledTimes(1)
    expect(props.onSwapColors).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('shows lasso controls with the expected disabled state', () => {
    render(
      <EditorToolbar
        {...createToolbarProps({
          currentTool: 'lasso',
          hasFloatingSelection: false,
          hasActiveLassoSelection: false,
        })}
      />,
    )

    expect(screen.getByRole('button', { name: 'Sel to Layer' })).toBeDisabled()
  })
})
