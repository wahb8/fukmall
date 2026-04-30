import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InstagramCaptionPreview } from './InstagramCaptionPreview'

describe('InstagramCaptionPreview', () => {
  it('renders the profile name immediately before the generated caption', () => {
    render(
      <InstagramCaptionPreview
        profileName="Moonline Cafe"
        caption="Fresh coffee, now pouring."
      />,
    )

    const preview = screen.getByRole('region', { name: 'Instagram caption preview' })
    const copy = within(preview).getByText('Moonline Cafe').closest('p')

    expect(copy).toHaveTextContent('Moonline CafeFresh coffee, now pouring.')
  })

  it('shows a calm placeholder when there is no generated caption yet', () => {
    render(<InstagramCaptionPreview profileName="Kryopic" />)

    expect(screen.getByText('Your generated caption will appear here.')).toBeInTheDocument()
  })
})
