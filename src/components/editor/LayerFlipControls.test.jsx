import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LayerFlipControls } from './LayerFlipControls'

describe('LayerFlipControls', () => {
  it('renders both flip actions and calls the provided handlers', () => {
    const onFlipHorizontal = vi.fn()
    const onFlipVertical = vi.fn()

    render(
      <LayerFlipControls
        onFlipHorizontal={onFlipHorizontal}
        onFlipVertical={onFlipVertical}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Flip Horizontal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flip Vertical' }))

    expect(screen.getByRole('group', { name: 'Layer flip controls' })).toBeInTheDocument()
    expect(onFlipHorizontal).toHaveBeenCalledTimes(1)
    expect(onFlipVertical).toHaveBeenCalledTimes(1)
  })
})
