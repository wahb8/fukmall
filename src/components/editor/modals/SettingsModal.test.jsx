import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from './SettingsModal'

describe('SettingsModal', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the theme and import toggles and closes from the close button', () => {
    const onClose = vi.fn()
    const onToggleTheme = vi.fn()
    const onToggleTrimTransparentImports = vi.fn()

    render(
      <SettingsModal
        isOpen
        theme="light"
        trimTransparentImports
        onClose={onClose}
        onToggleTheme={onToggleTheme}
        onToggleTrimTransparentImports={onToggleTrimTransparentImports}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Toggle dark mode' }))
    fireEvent.click(screen.getByRole('button', { name: /Trim Transparent Imports/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Dark UI')).toBeInTheDocument()
    expect(screen.getByText('On')).toBeInTheDocument()
    expect(onToggleTheme).toHaveBeenCalledTimes(1)
    expect(onToggleTrimTransparentImports).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('can be opened and closed from a trigger flow', () => {
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
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
  })
})
