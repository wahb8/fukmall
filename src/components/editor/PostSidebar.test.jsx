import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PostSidebar } from './PostSidebar'

describe('PostSidebar', () => {
  it('renders posts and forwards logo, new-post, and post-selection actions', () => {
    const onLogoClick = vi.fn()
    const onNewPost = vi.fn()
    const onSelectPost = vi.fn()

    render(
      <PostSidebar
        logoHref="/"
        onLogoClick={onLogoClick}
        onNewPost={onNewPost}
        onSelectPost={onSelectPost}
        activePostId="post-2"
        posts={[
          {
            id: 'post-1',
            title: 'Launch draft',
            subtitle: 'Warm editorial layout',
            detail: 'Draft',
            thumbnailLabel: 'LD',
          },
          {
            id: 'post-2',
            title: 'Spring capsule',
            subtitle: 'Social post',
            detail: '2h',
            thumbnailLabel: 'SC',
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Kryopic home' }))
    fireEvent.click(screen.getByRole('button', { name: 'New Post' }))
    fireEvent.click(screen.getByRole('button', { name: 'Launch draft' }))

    expect(onLogoClick).toHaveBeenCalledTimes(1)
    expect(onNewPost).toHaveBeenCalledTimes(1)
    expect(onSelectPost).toHaveBeenCalledWith('post-1')
    expect(screen.getByRole('button', { name: 'Spring capsule' })).toHaveClass('active')
  })
})
