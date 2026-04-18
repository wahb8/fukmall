import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExternalImageDropOverlay } from './ExternalImageDropOverlay'

describe('ExternalImageDropOverlay', () => {
  it('does not render when hidden', () => {
    const { container } = render(<ExternalImageDropOverlay isVisible={false} />)

    expect(container.firstChild).toBeNull()
  })

  it('renders the drop prompt when visible', () => {
    render(<ExternalImageDropOverlay isVisible />)

    expect(screen.getByText('Import Image')).toBeInTheDocument()
    expect(screen.getByText('Drag and drop to import image')).toBeInTheDocument()
  })
})
