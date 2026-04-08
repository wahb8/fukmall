import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UnsavedChangesModal } from './UnsavedChangesModal'

describe('UnsavedChangesModal', () => {
  it('renders the warning copy and fires the expected actions', () => {
    const onClose = vi.fn()
    const onDiscardAndCreateNew = vi.fn()

    render(
      <UnsavedChangesModal
        isOpen
        onClose={onClose}
        onDiscardAndCreateNew={onDiscardAndCreateNew}
      />,
    )

    expect(screen.getByText('Create New File?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Discard and Create New' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDiscardAndCreateNew).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
