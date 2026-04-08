import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PromptShell } from './PromptShell'

describe('PromptShell', () => {
  it('renders the presentational prompt input', () => {
    render(<PromptShell />)

    expect(screen.getByPlaceholderText('Describe what you want to create...')).toBeInTheDocument()
  })
})
