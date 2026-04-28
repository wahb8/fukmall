import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('collects business details, logo, references, and branding fields before submitting', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)

    render(
      <OnboardingModal
        isOpen
        onClose={vi.fn()}
        onComplete={onComplete}
      />,
    )

    const firstNextButton = screen.getByRole('button', { name: 'Next' })
    expect(firstNextButton).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Gym' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salon' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Business name'), {
      target: { value: ' Moonline Cafe ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cafe' }))
    expect(firstNextButton).toBeEnabled()
    fireEvent.click(firstNextButton)

    const logoFile = new File(['logo-image'], 'logo.png', { type: 'image/png' })
    fireEvent.change(screen.getAllByLabelText('Upload logo')[0], {
      target: { files: [logoFile] },
    })

    const seedInput = screen.getByLabelText('Upload reference image 1')
    const seedFile = new File(['seed-image'], 'seed.png', { type: 'image/png' })
    fireEvent.change(seedInput, {
      target: {
        files: [seedFile],
      },
    })

    const bulkInput = screen.getByLabelText('Upload reference image 2')
    const bulkFiles = Array.from({ length: 5 }, (_, index) => (
      new File([`image-${index + 2}`], `bulk-${index + 2}.png`, { type: 'image/png' })
    ))
    fireEvent.change(bulkInput, {
      target: {
        files: bulkFiles,
      },
    })

    expect(screen.getByAltText('Uploaded logo preview')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /Uploaded reference image \d preview/i })).toHaveLength(5)
    expect(screen.getByText('seed.png')).toBeInTheDocument()
    expect(screen.getByText('bulk-2.png')).toBeInTheDocument()
    expect(screen.getByText('bulk-5.png')).toBeInTheDocument()
    expect(screen.queryByText('bulk-6.png')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('5 reference images selected')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    fireEvent.click(screen.getByRole('button', { name: 'Warm and friendly' }))
    fireEvent.change(screen.getByLabelText('Brand color 1'), {
      target: { value: '#D97706' },
    })
    fireEvent.change(screen.getByLabelText('Brand color 2'), {
      target: { value: 'F59E0B' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Creating!' }))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({
        name: 'Moonline Cafe',
        businessType: 'Cafe',
        tonePreference: 'Warm and friendly',
        brandColors: ['#D97706', '#F59E0B'],
        logoFile,
        referenceFiles: [
          seedFile,
          bulkFiles[0],
          bulkFiles[1],
          bulkFiles[2],
          bulkFiles[3],
        ],
      })
    })
  })

  it('lets a user skip uploads but still requires a tone before finishing', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)

    render(
      <OnboardingModal
        isOpen
        onClose={vi.fn()}
        onComplete={onComplete}
      />,
    )

    fireEvent.change(screen.getByLabelText('Business name'), {
      target: { value: 'Northline Studio' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Startup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    const finishButton = screen.getByRole('button', { name: 'Start Creating!' })
    expect(finishButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Minimal' }))
    expect(finishButton).toBeEnabled()
    fireEvent.click(finishButton)

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({
        name: 'Northline Studio',
        businessType: 'Startup',
        tonePreference: 'Minimal',
        brandColors: [],
        logoFile: null,
        referenceFiles: [],
      })
    })
  })
})
