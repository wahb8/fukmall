import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PromptShell } from './PromptShell'

afterEach(() => {
  cleanup()
})

describe('PromptShell', () => {
  it('renders the prompt input and forwards submit and file-selection actions', () => {
    const handleSubmit = vi.fn()
    const handleFilesSelected = vi.fn()
    const handleChange = vi.fn()
    const { container } = render(
      <PromptShell
        value="Create a launch post"
        onChange={handleChange}
        onSubmit={handleSubmit}
        onFilesSelected={handleFilesSelected}
      />,
    )

    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '1')

    fireEvent.change(screen.getByDisplayValue('Create a launch post'), {
      target: { value: 'Create a launch story' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit prompt' }))

    const file = new File(['image'], 'photo.png', { type: 'image/png' })
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: {
        files: [file],
      },
    })

    expect(handleChange).toHaveBeenCalledWith('Create a launch story')
    expect(handleSubmit).toHaveBeenCalledTimes(1)
    expect(handleFilesSelected).toHaveBeenCalledWith([file])
  })

  it('keeps shift-enter available for multiline prompt entry', () => {
    const handleSubmit = vi.fn()

    render(
      <PromptShell
        value="Create a launch post"
        onSubmit={handleSubmit}
      />,
    )

    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      shiftKey: true,
    })

    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('renders selected attachments and lets the user remove them', () => {
    const handleRemoveAttachment = vi.fn()

    render(
      <PromptShell
        attachments={[
          {
            id: 'asset-1',
            original_file_name: 'logo.png',
            previewUrl: 'https://example.com/logo.png',
          },
        ]}
        onRemoveAttachment={handleRemoveAttachment}
      />,
    )

    expect(screen.getByAltText('logo.png')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove logo.png' }))

    expect(handleRemoveAttachment).toHaveBeenCalledWith('asset-1')
  })

  it('disables attachment removal while the composer is locked', () => {
    const handleRemoveAttachment = vi.fn()

    render(
      <PromptShell
        disabled
        attachments={[
          {
            id: 'asset-1',
            original_file_name: 'logo.png',
            previewUrl: 'https://example.com/logo.png',
          },
        ]}
        onRemoveAttachment={handleRemoveAttachment}
      />,
    )

    const removeButton = screen.getByRole('button', { name: 'Remove logo.png' })

    expect(removeButton).toBeDisabled()
    fireEvent.click(removeButton)
    expect(handleRemoveAttachment).not.toHaveBeenCalled()
  })
})
