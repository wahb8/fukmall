import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChatTimelinePanel } from './ChatTimelinePanel'

describe('ChatTimelinePanel', () => {
  it('renders user messages and generated post entries', () => {
    render(
      <ChatTimelinePanel
        title="Morning drop"
        entries={[
          {
            id: 'message-1',
            kind: 'message',
            role: 'user',
            text: 'Create a post for our new coffee beans.',
            attachments: [
              {
                id: 'asset-1',
                original_file_name: 'beans.png',
                previewUrl: 'https://example.com/beans.png',
              },
            ],
            createdAt: '2026-04-28T12:00:00.000Z',
          },
          {
            id: 'post-1',
            kind: 'generated_post',
            captionText: 'Fresh roast landing this week.',
            previewUrl: 'https://example.com/post.png',
            detail: 'Draft',
            createdAt: '2026-04-28T12:02:00.000Z',
          },
        ]}
      />,
    )

    expect(screen.getByText('Morning drop')).toBeInTheDocument()
    expect(screen.getByText('Create a post for our new coffee beans.')).toBeInTheDocument()
    expect(screen.getByAltText('beans.png')).toBeInTheDocument()
    expect(screen.getByText('Fresh roast landing this week.')).toBeInTheDocument()
    expect(screen.getByAltText('Generated post preview')).toBeInTheDocument()
  })

  it('shows an empty state when there is no active history yet', () => {
    render(<ChatTimelinePanel entries={[]} emptyMessage="No history yet" />)

    expect(screen.getByText('No history yet')).toBeInTheDocument()
  })
})
