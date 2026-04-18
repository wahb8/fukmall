import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssetLibraryPanel } from './AssetLibraryPanel'

function createProps(overrides = {}) {
  return {
    icons: { close: '/close.svg' },
    assetLibraryInputRef: { current: null },
    assetLibrary: [],
    draggedAssetId: null,
    onImport: vi.fn(),
    onInputChange: vi.fn(),
    onAssetDragStart: vi.fn(),
    onAssetDragEnd: vi.fn(),
    onDeleteAsset: vi.fn(),
    ...overrides,
  }
}

describe('AssetLibraryPanel', () => {
  it('renders the empty state and dispatches import/input callbacks', () => {
    const props = createProps()

    render(<AssetLibraryPanel {...props} />)

    expect(screen.getByText(/Import PNG, JPG, SVG, or WEBP assets/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Import Images' }))
    fireEvent.change(screen.getByRole('textbox', { hidden: true }), {
      target: { files: [new File(['asset'], 'poster.png', { type: 'image/png' })] },
    })

    expect(props.onImport).toHaveBeenCalledTimes(1)
    expect(props.onInputChange).toHaveBeenCalledTimes(1)
  })

  it('renders asset cards, drag state, and delete behavior without triggering parent drag handlers', () => {
    const props = createProps({
      assetLibrary: [
        { id: 'asset-1', name: 'Poster', src: '/poster.png' },
        { id: 'asset-2', name: 'Badge', src: '/badge.png' },
      ],
      draggedAssetId: 'asset-1',
    })

    render(<AssetLibraryPanel {...props} />)

    const posterCard = screen.getByRole('button', { name: /Poster/i })
    expect(posterCard.className).toContain('dragging')

    fireEvent.dragStart(posterCard)
    fireEvent.dragEnd(posterCard)

    expect(props.onAssetDragStart).toHaveBeenCalledTimes(1)
    expect(props.onAssetDragStart.mock.calls[0][1]).toEqual({
      id: 'asset-1',
      name: 'Poster',
      src: '/poster.png',
    })
    expect(props.onAssetDragEnd).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Delete Poster from asset library' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Poster from asset library' }))

    expect(props.onDeleteAsset).toHaveBeenCalledWith('asset-1')
    expect(props.onAssetDragStart).toHaveBeenCalledTimes(1)
  })
})
