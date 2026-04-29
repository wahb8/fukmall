import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AssetImage } from './AssetImage'

afterEach(() => {
  cleanup()
})

describe('AssetImage', () => {
  it('shows a loading placeholder until the image loads', () => {
    render(<AssetImage src="/preview.png" alt="Preview" />)

    expect(screen.getByRole('status', { name: 'Loading asset' })).toBeInTheDocument()

    fireEvent.load(screen.getByAltText('Preview'))

    expect(screen.queryByRole('status', { name: 'Loading asset' })).toBeNull()
  })

  it('resets the loading state when the source changes', () => {
    const { rerender } = render(<AssetImage src="/first.png" alt="Preview" />)

    fireEvent.load(screen.getByAltText('Preview'))
    expect(screen.queryByRole('status', { name: 'Loading asset' })).toBeNull()

    rerender(<AssetImage src="/second.png" alt="Preview" />)

    expect(screen.getByRole('status', { name: 'Loading asset' })).toBeInTheDocument()
  })
})
