import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PostSidebar } from './PostSidebar'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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
    expect(screen.getByRole('button', { name: 'Spring capsule' }).closest('.post-sidebar-post')).toHaveClass('active')
  })

  it('supports inline rename and delete actions for the active chat', async () => {
    const onRenamePost = vi.fn().mockResolvedValue(undefined)
    const onDeletePost = vi.fn().mockResolvedValue(undefined)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <PostSidebar
        activePostId="post-1"
        posts={[
          {
            id: 'post-1',
            title: 'Launch draft',
            subtitle: 'Warm editorial layout',
            detail: 'Draft',
            thumbnailLabel: 'LD',
          },
        ]}
        onRenamePost={onRenamePost}
        onDeletePost={onDeletePost}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByDisplayValue('Launch draft'), {
      target: { value: 'Summer launch' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onRenamePost).toHaveBeenCalledWith('post-1', 'Summer launch')
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(onDeletePost).toHaveBeenCalledWith('post-1')
  })
})
