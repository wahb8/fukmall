import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PromptAttachmentTabs, PromptShell } from './PromptShell'

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

  it('turns the submit button into a stop action while generating', () => {
    const handleSubmit = vi.fn()
    const handleStop = vi.fn()

    render(
      <PromptShell
        value="Create a launch post"
        isSubmitting
        onSubmit={handleSubmit}
        onStop={handleStop}
      />,
    )

    const stopButton = screen.getByRole('button', { name: 'Stop generating' })

    expect(stopButton).not.toBeDisabled()
    expect(screen.getByRole('textbox')).toBeDisabled()

    fireEvent.click(stopButton)

    expect(handleStop).toHaveBeenCalledTimes(1)
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('keeps prompt text editable while attachments are still loading', () => {
    const handleSubmit = vi.fn()
    const handleChange = vi.fn()

    render(
      <PromptShell
        value="Create a launch post"
        isUploadingAttachments
        onChange={handleChange}
        onSubmit={handleSubmit}
      />,
    )

    const promptInput = screen.getByRole('textbox')

    expect(promptInput).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add image' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Submit prompt' })).toBeDisabled()

    fireEvent.change(promptInput, {
      target: { value: 'Create a launch post with brighter colors' },
    })
    fireEvent.keyDown(promptInput, {
      key: 'Enter',
      shiftKey: false,
    })

    expect(handleChange).toHaveBeenCalledWith('Create a launch post with brighter colors')
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('can disable only the attachment picker while leaving prompt entry available', () => {
    const handleChange = vi.fn()

    render(
      <PromptShell
        value="Create a launch post"
        isAttachmentPickerDisabled
        onChange={handleChange}
      />,
    )

    const promptInput = screen.getByRole('textbox')

    expect(screen.getByRole('button', { name: 'Add image' })).toBeDisabled()
    expect(promptInput).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Submit prompt' })).not.toBeDisabled()

    fireEvent.change(promptInput, {
      target: { value: 'Create a launch post with a product photo' },
    })

    expect(handleChange).toHaveBeenCalledWith('Create a launch post with a product photo')
  })

  it('keeps keyboard submit behavior for normal prompt entry', () => {
    const handleSubmit = vi.fn()

    render(
      <PromptShell
        value="Create a launch post"
        onSubmit={handleSubmit}
      />,
    )

    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      shiftKey: false,
    })

    expect(handleSubmit).toHaveBeenCalledTimes(1)
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

  it('shows a loading placeholder for pending attachments', () => {
    render(
      <PromptAttachmentTabs
        attachments={[
          {
            id: 'pending-attachment-1',
            original_file_name: 'logo.png',
            isLoading: true,
          },
        ]}
      />,
    )

    expect(screen.getByRole('status', { name: 'Loading logo.png' })).toBeInTheDocument()
    expect(screen.queryByAltText('logo.png')).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove logo.png' })).toBeDisabled()
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

  it('can hide inline attachment previews when another surface owns the attachment UI', () => {
    render(
      <PromptShell
        showAttachments={false}
        attachments={[
          {
            id: 'asset-1',
            original_file_name: 'logo.png',
            previewUrl: 'https://example.com/logo.png',
          },
        ]}
      />,
    )

    expect(screen.queryByLabelText('Selected prompt attachments')).toBeNull()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders reusable attachment tabs with a custom anchoring class', () => {
    render(
      <PromptAttachmentTabs
        className="canvas-attachment-tabs"
        attachments={[
          {
            id: 'asset-1',
            original_file_name: 'coffee.png',
            previewUrl: 'https://example.com/coffee.png',
          },
        ]}
      />,
    )

    expect(screen.getByLabelText('Selected prompt attachments')).toHaveClass('canvas-attachment-tabs')
    expect(screen.getByAltText('coffee.png')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove coffee.png' })).toBeInTheDocument()
  })
})
