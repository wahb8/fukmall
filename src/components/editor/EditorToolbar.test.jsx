import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    hasActiveRectSelection: false,
    canUndo: true,
    canRedo: false,
    toolPanelError: { message: '', isRendered: false, isVisible: false, isFading: false },
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
  afterEach(() => {
    cleanup()
  })

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

  it('renders the rectangle selection tool and enables selection actions there too', () => {
    const props = createToolbarProps({
      currentTool: 'rectSelect',
      hasActiveRectSelection: true,
    })

    render(<EditorToolbar {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Rectangle Selection' }))

    expect(props.onActivateTool).toHaveBeenCalledWith('rectSelect')
    expect(screen.getByRole('button', { name: 'Sel to Layer' })).toBeEnabled()
  })

  it('renders the transient tool-panel error only while it is active or fading', () => {
    const { rerender } = render(
      <EditorToolbar
        {...createToolbarProps({
          toolPanelError: {
            message: '',
            isRendered: false,
            isVisible: false,
            isFading: false,
          },
        })}
      />,
    )

    expect(screen.queryByRole('status')).toBeNull()

    rerender(
      <EditorToolbar
        {...createToolbarProps({
          toolPanelError: {
            message: 'Test error',
            isRendered: true,
            isVisible: true,
            isFading: false,
          },
        })}
      />,
    )

    expect(screen.getByRole('status')).toHaveClass('tool-panel-error', 'visible')

    rerender(
      <EditorToolbar
        {...createToolbarProps({
          toolPanelError: {
            message: 'Test error',
            isRendered: true,
            isVisible: false,
            isFading: true,
          },
        })}
      />,
    )

    expect(screen.getByRole('status')).toHaveClass('tool-panel-error', 'fading')

    rerender(
      <EditorToolbar
        {...createToolbarProps({
          toolPanelError: {
            message: '',
            isRendered: false,
            isVisible: false,
            isFading: false,
          },
        })}
      />,
    )

    expect(screen.queryByRole('status')).toBeNull()
  })
})
