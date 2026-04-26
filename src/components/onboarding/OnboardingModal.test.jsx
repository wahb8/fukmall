import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingModal } from './OnboardingModal'

describe('OnboardingModal', () => {
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL

  beforeEach(() => {
    let previewId = 0

    URL.createObjectURL = vi.fn(() => `blob:preview-${previewId += 1}`)
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    cleanup()

    if (originalCreateObjectUrl) {
      URL.createObjectURL = originalCreateObjectUrl
    } else {
      delete URL.createObjectURL
    }

    if (originalRevokeObjectUrl) {
      URL.revokeObjectURL = originalRevokeObjectUrl
    } else {
      delete URL.revokeObjectURL
    }
  })

  it('fills remaining upload slots from a multi-image selection and caps the total at five', () => {
    const onClose = vi.fn()
    const onComplete = vi.fn()

    render(
      <OnboardingModal
        isOpen
        onClose={onClose}
        onComplete={onComplete}
      />,
    )

    const firstNextButton = screen.getByRole('button', { name: 'Next' })
    expect(firstNextButton).toBeDisabled()
    expect(screen.getByRole('button', { name: 'E-commerce' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Startup' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clothing' }))
    expect(firstNextButton).toBeEnabled()
    fireEvent.click(firstNextButton)

    expect(screen.getByRole('heading', {
      name: 'Share some examples of posts of your business to personalize your experience.',
    })).toBeInTheDocument()

    const secondNextButton = screen.getByRole('button', { name: 'Next' })
    expect(secondNextButton).toBeDisabled()

    const seedInput = screen.getByLabelText('Upload image 1')
    const seedFile = new File(['seed-image'], 'seed.png', { type: 'image/png' })

    fireEvent.change(seedInput, {
      target: {
        files: [seedFile],
      },
    })

    const bulkInput = screen.getByLabelText('Upload image 2')
    const bulkFiles = Array.from({ length: 5 }, (_, index) => (
      new File([`image-${index + 2}`], `bulk-${index + 2}.png`, { type: 'image/png' })
    ))

    fireEvent.change(bulkInput, {
      target: {
        files: bulkFiles,
      },
    })

    expect(screen.getByAltText('Uploaded image 1 preview')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /Uploaded image \d preview/i })).toHaveLength(5)
    expect(screen.getByText('seed.png')).toBeInTheDocument()
    expect(screen.getByText('bulk-2.png')).toBeInTheDocument()
    expect(screen.getByText('bulk-5.png')).toBeInTheDocument()
    expect(screen.queryByText('bulk-6.png')).toBeNull()
    expect(secondNextButton).toBeEnabled()

    fireEvent.click(secondNextButton)
    fireEvent.click(screen.getByRole('button', { name: 'Start Creating!' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('lets a new business skip uploads and continue', () => {
    render(
      <OnboardingModal
        isOpen
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cafe' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'I am a new business' }))

    expect(screen.getByRole('img', {
      name: 'Future onboarding video placeholder',
    })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Creating!' })).toBeInTheDocument()
  })
})
