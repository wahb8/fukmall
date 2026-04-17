import { fireEvent, render, screen } from '@testing-library/react'
import { within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LayerPanel } from './LayerPanel'
import { createDocument, createRasterLayer } from '../../lib/layers'

function createLayerDocument(count = 8) {
  const layers = Array.from({ length: count }, (_, index) => createRasterLayer({
    name: `Layer ${index + 1}`,
    width: 120,
    height: 120,
  }))

  return createDocument(layers, layers.at(-1)?.id ?? null)
}

function createProps(overrides = {}) {
  const documentState = createLayerDocument()

  return {
    documentState,
    documentWidth: documentState.width,
    documentHeight: documentState.height,
    draggedLayerId: null,
    layerDropTarget: null,
    addLayer: vi.fn(),
    applyDocumentChange: vi.fn(),
    createRasterLayer,
    handleLayerDragEnd: vi.fn(),
    handleLayerDragOver: vi.fn(),
    handleLayerDragStart: vi.fn(),
    handleLayerDrop: vi.fn(),
    handleMergeDown: vi.fn(),
    onSelectLayer: vi.fn(),
    onToggleLayerSelection: vi.fn(),
    ...overrides,
  }
}

function getFooterAddButton(container) {
  const footer = container.querySelector('.layer-panel-footer')

  expect(footer).not.toBeNull()

  return footer.querySelector('button[aria-label="Add Drawing"]')
}

function getLayerRowByName(container, name) {
  const input = Array.from(container.querySelectorAll('.layer-name-input')).find(
    (candidate) => candidate.value === name,
  )

  expect(input).not.toBeUndefined()

  return input.closest('.layer-row')
}

function getRowActionButton(row, label) {
  return within(row).getByRole('button', { name: label })
}

describe('LayerPanel', () => {
  it('renders layer rows inside a dedicated scrollable container and keeps the footer outside it', () => {
    const props = createProps()
    const { container } = render(<LayerPanel {...props} />)

    const scroller = screen.getByTestId('layer-list-scroller')
    const footer = container.querySelector('.layer-panel-footer')
    const addButton = getFooterAddButton(container)

    expect(scroller).not.toBeNull()
    expect(footer).not.toBeNull()
    expect(addButton).not.toBeNull()
    expect(scroller.querySelectorAll('.layer-row')).toHaveLength(props.documentState.layers.length)
    expect(scroller.contains(addButton)).toBe(false)
    expect(footer.contains(addButton)).toBe(true)
  })

  it('keeps the add-layer footer action accessible even with many rows', () => {
    const props = createProps({ documentState: createLayerDocument(12) })
    const { container } = render(<LayerPanel {...props} />)

    fireEvent.click(getFooterAddButton(container))

    expect(props.addLayer).toHaveBeenCalledTimes(1)
  })

  it('preserves row interaction wiring after the scroll-container restructure', () => {
    const props = createProps()
    const { container } = render(<LayerPanel {...props} />)
    const selectedRow = getLayerRowByName(container, 'Layer 8')

    fireEvent.click(selectedRow)
    fireEvent.click(getRowActionButton(selectedRow, 'Hide layer'))
    fireEvent.click(getRowActionButton(selectedRow, 'Duplicate layer'))

    expect(props.onSelectLayer).toHaveBeenCalledWith(props.documentState.layers.at(-1).id)
    expect(props.applyDocumentChange).toHaveBeenCalledTimes(2)
  })

  it('still supports shift-click multi-selection toggling on layer rows', () => {
    const props = createProps()
    const { container } = render(<LayerPanel {...props} />)

    fireEvent.click(getLayerRowByName(container, 'Layer 7'), { shiftKey: true })

    expect(props.onToggleLayerSelection).toHaveBeenCalledWith(props.documentState.layers.at(-2).id)
  })
})
