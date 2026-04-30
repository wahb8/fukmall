import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from './SettingsModal'

const {
  fetchDefaultBusinessProfileMock,
  saveBusinessProfileMock,
} = vi.hoisted(() => ({
  fetchDefaultBusinessProfileMock: vi.fn(),
  saveBusinessProfileMock: vi.fn(),
}))

vi.mock('../../../lib/onboarding', () => ({
  fetchDefaultBusinessProfile: fetchDefaultBusinessProfileMock,
  saveBusinessProfile: saveBusinessProfileMock,
}))

describe('SettingsModal', () => {
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL

  beforeEach(() => {
    let previewId = 0

    fetchDefaultBusinessProfileMock.mockReset()
    saveBusinessProfileMock.mockReset()
    fetchDefaultBusinessProfileMock.mockResolvedValue(null)
    URL.createObjectURL = vi.fn(() => `blob:settings-preview-${previewId += 1}`)
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

  it('renders the theme and import toggles and closes from the close button', async () => {
    const onClose = vi.fn()
    const onToggleTheme = vi.fn()
    const onToggleTrimTransparentImports = vi.fn()
    const onToggleShowChatPanel = vi.fn()

    render(
      <SettingsModal
        isOpen
        theme="light"
        trimTransparentImports
        showChatPanel={false}
        onClose={onClose}
        onToggleTheme={onToggleTheme}
        onToggleTrimTransparentImports={onToggleTrimTransparentImports}
        onToggleShowChatPanel={onToggleShowChatPanel}
      />,
    )

    await waitFor(() => {
      expect(fetchDefaultBusinessProfileMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Toggle dark mode' }))
    fireEvent.click(screen.getByRole('button', { name: /Trim Transparent Imports/i }))
    fireEvent.click(screen.getByRole('button', { name: /Chat Side Panel/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Dark UI')).toBeInTheDocument()
    expect(screen.getByText('On')).toBeInTheDocument()
    expect(screen.getByText('Hidden')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull()
    expect(onToggleTheme).toHaveBeenCalledTimes(1)
    expect(onToggleTrimTransparentImports).toHaveBeenCalledTimes(1)
    expect(onToggleShowChatPanel).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('loads, edits, and saves the onboarding business profile fields', async () => {
    const existingProfile = {
      id: 'profile-1',
      name: 'Moonline Cafe',
      business_type: 'Cafe',
      tone_preferences: ['Warm and friendly'],
      brand_colors: ['#D97706', '#F59E0B'],
      logoAsset: {
        id: 'logo-1',
        original_file_name: 'logo.png',
        previewUrl: 'https://cdn.example.com/logo.png',
      },
      referenceAssets: [
        {
          id: 'reference-1',
          original_file_name: 'ref-1.png',
          previewUrl: 'https://cdn.example.com/ref-1.png',
        },
        {
          id: 'reference-2',
          original_file_name: 'ref-2.png',
          previewUrl: 'https://cdn.example.com/ref-2.png',
        },
      ],
    }

    fetchDefaultBusinessProfileMock
      .mockResolvedValueOnce(existingProfile)
      .mockResolvedValueOnce({
        ...existingProfile,
        name: 'Moonline Roastery',
        business_type: 'Restaurant',
        tone_preferences: ['Premium'],
        brand_colors: ['#111111'],
        logoAsset: null,
        referenceAssets: [
          {
            id: 'reference-2',
            original_file_name: 'ref-2.png',
            previewUrl: 'https://cdn.example.com/ref-2.png',
          },
        ],
      })
    saveBusinessProfileMock.mockResolvedValue({
      id: 'profile-1',
    })

    render(
      <SettingsModal
        isOpen
        theme="light"
        trimTransparentImports={false}
        onClose={vi.fn()}
        onToggleTheme={vi.fn()}
        onToggleTrimTransparentImports={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(fetchDefaultBusinessProfileMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Brand & onboarding' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Moonline Cafe')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Business name'), {
      target: { value: 'Moonline Roastery' },
    })
    fireEvent.change(screen.getByLabelText('Business type'), {
      target: { value: 'Restaurant' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Premium' }))
    fireEvent.change(screen.getByLabelText('Brand color 1'), {
      target: { value: '#111111' },
    })
    fireEvent.change(screen.getByLabelText('Brand color 2'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove reference image 1' }))

    const newReferenceFile = new File(['reference-image'], 'new-reference.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Add reference images'), {
      target: {
        files: [newReferenceFile],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => {
      expect(saveBusinessProfileMock).toHaveBeenCalledWith({
        name: 'Moonline Roastery',
        businessType: 'Restaurant',
        tonePreference: 'Premium',
        brandColors: ['#111111', '', '', ''],
        logoFile: null,
        referenceFiles: [newReferenceFile],
        existingLogoAssetId: null,
        existingReferenceAssetIds: ['reference-2'],
      })
    })

    await waitFor(() => {
      expect(fetchDefaultBusinessProfileMock).toHaveBeenCalledTimes(2)
      expect(screen.getByText('Business profile updated.')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Moonline Roastery')).toBeInTheDocument()
    })
  })

  it('can be opened and closed from a trigger flow', async () => {
    function Harness() {
      const [isOpen, setIsOpen] = useState(false)

      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Settings
          </button>
          <SettingsModal
            isOpen={isOpen}
            theme="dark"
            trimTransparentImports={false}
            onClose={() => setIsOpen(false)}
            onToggleTheme={() => {}}
            onToggleTrimTransparentImports={() => {}}
          />
        </>
      )
    }

    render(<Harness />)

    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
  })
})
