import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewFileModal } from './NewFileModal'

describe('NewFileModal', () => {
  it('renders fields and dispatches modal callbacks', () => {
    const onClose = vi.fn()
    const onPresetSelect = vi.fn()
    const onNameChange = vi.fn()
    const onWidthChange = vi.fn()
    const onHeightChange = vi.fn()
    const onCreate = vi.fn()

    render(
      <NewFileModal
        isOpen
        name="Doc"
        width="1080"
        height="1440"
        minDimension={1}
        onPresetSelect={onPresetSelect}
        onClose={onClose}
        onNameChange={onNameChange}
        onWidthChange={onWidthChange}
        onHeightChange={onHeightChange}
        onCreate={onCreate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Square 1:1 1080 x 1080' }))
    fireEvent.change(screen.getByDisplayValue('Doc'), { target: { value: 'Poster' } })
    fireEvent.change(screen.getByDisplayValue('1080'), { target: { value: '900' } })
    fireEvent.change(screen.getByDisplayValue('1440'), { target: { value: '1200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onPresetSelect).toHaveBeenCalledTimes(1)
    expect(onNameChange).toHaveBeenCalledTimes(1)
    expect(onWidthChange).toHaveBeenCalledTimes(1)
    expect(onHeightChange).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('marks the matching preset active from the current dimensions', () => {
    render(
      <NewFileModal
        isOpen
        name="Doc"
        width="1080"
        height="1350"
        minDimension={1}
        onPresetSelect={vi.fn()}
        onClose={vi.fn()}
        onNameChange={vi.fn()}
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
        onCreate={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Portrait 4:5 1080 x 1350' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Square 1:1 1080 x 1080' })).toHaveAttribute('aria-pressed', 'false')
  })
})
