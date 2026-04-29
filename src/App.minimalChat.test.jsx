import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const {
  createChatMock,
  deleteChatMock,
  generatePostMock,
  listChatsMock,
  loadChatSessionMock,
  renameChatMock,
  uploadPromptAttachmentMock,
} = vi.hoisted(() => ({
  createChatMock: vi.fn(),
  deleteChatMock: vi.fn(),
  generatePostMock: vi.fn(),
  listChatsMock: vi.fn(),
  loadChatSessionMock: vi.fn(),
  renameChatMock: vi.fn(),
  uploadPromptAttachmentMock: vi.fn(),
}))

vi.mock('./lib/chatSessions', () => ({
  createChat: createChatMock,
  deleteChat: deleteChatMock,
  generatePost: generatePostMock,
  listChats: listChatsMock,
  loadChatSession: loadChatSessionMock,
  renameChat: renameChatMock,
  uploadPromptAttachment: uploadPromptAttachmentMock,
}))

function createChatSummary(id, title, detail = 'Apr 28') {
  return {
    id,
    title,
    subtitle: `${title} summary`,
    detail,
    thumbnailLabel: title.slice(0, 2).toUpperCase(),
  }
}

function createChatSession(id, title, overrides = {}) {
  return {
    chat: {
      id,
      title,
      status: 'active',
    },
    timelineEntries: [],
    latestGeneratedPost: null,
    ...overrides,
  }
}

function createDeferred() {
  let resolve
  let reject

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

describe('App minimal chat shell', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext

  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
    createChatMock.mockReset()
    deleteChatMock.mockReset()
    generatePostMock.mockReset()
    listChatsMock.mockReset()
    loadChatSessionMock.mockReset()
    renameChatMock.mockReset()
    uploadPromptAttachmentMock.mockReset()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function mockGetContext(contextType) {
        const context = originalGetContext.call(this, contextType)

        if (contextType !== '2d' || !context) {
          return context
        }

        return Object.assign(context, {
          getImageData: (x = 0, y = 0, width = 1, height = 1) => ({
            x,
            y,
            data: new Uint8ClampedArray(Math.max(1, width * height * 4)).fill(255),
          }),
          putImageData: () => {},
        })
      })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('clears the draft composer state when the active chat is deleted', async () => {
    listChatsMock
      .mockResolvedValueOnce([
        createChatSummary('chat-1', 'Alpha'),
        createChatSummary('chat-2', 'Beta'),
      ])
      .mockResolvedValueOnce([
        createChatSummary('chat-2', 'Beta'),
      ])
    loadChatSessionMock.mockImplementation(async (chatId) => (
      chatId === 'chat-1'
        ? createChatSession('chat-1', 'Alpha')
        : createChatSession('chat-2', 'Beta')
    ))
    deleteChatMock.mockResolvedValue(undefined)

    render(<App />)

    const promptInput = await screen.findByPlaceholderText('Describe what you want to create...')

    fireEvent.change(promptInput, {
      target: { value: 'Temporary draft that should be cleared' },
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(deleteChatMock).toHaveBeenCalledWith('chat-1')
      expect(loadChatSessionMock).toHaveBeenCalledWith('chat-2')
      expect(promptInput).toHaveValue('')
    })
  })

  it('locks the prompt composer while a prompt submission is in flight', async () => {
    const submitDeferred = createDeferred()

    listChatsMock.mockResolvedValue([
      createChatSummary('chat-1', 'Campaign ideas'),
    ])
    loadChatSessionMock
      .mockResolvedValueOnce(createChatSession('chat-1', 'Campaign ideas'))
      .mockResolvedValueOnce(createChatSession('chat-1', 'Campaign ideas'))
    generatePostMock.mockReturnValue(submitDeferred.promise)

    render(<App />)

    const promptInput = await screen.findByPlaceholderText('Describe what you want to create...')
    fireEvent.change(promptInput, {
      target: { value: 'Create a launch post for our new coffee line' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit prompt' }))

    await waitFor(() => {
      expect(generatePostMock).toHaveBeenCalledWith({
        chatId: 'chat-1',
        prompt: 'Create a launch post for our new coffee line',
        width: 1080,
        height: 1440,
        businessProfileId: null,
        attachmentAssetIds: [],
      })
      expect(screen.getByPlaceholderText('Describe what you want to create...')).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Add image' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Submit prompt' })).toBeDisabled()
      expect(screen.getByRole('status', { name: 'Creating your post' })).toBeInTheDocument()
      expect(screen.queryByText('Creating your post...')).not.toBeInTheDocument()
    })

    submitDeferred.resolve({
      generation_mode: 'initial',
      post: {
        id: 'post-1',
      },
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Describe what you want to create...')).not.toBeDisabled()
    })
  })

  it('places the latest generated post into the canvas after prompt generation', async () => {
    listChatsMock.mockResolvedValue([
      createChatSummary('chat-1', 'Campaign ideas'),
    ])
    loadChatSessionMock
      .mockResolvedValueOnce(createChatSession('chat-1', 'Campaign ideas'))
      .mockResolvedValueOnce(createChatSession('chat-1', 'Campaign ideas', {
        latestGeneratedPost: {
          id: 'post-1',
          chat_id: 'chat-1',
          bucket_name: 'generated-posts',
          image_storage_path: 'user/renders/post-1.png',
          previewUrl: 'https://example.com/generated-post.png',
          width: 1080,
          height: 1350,
        },
        timelineEntries: [
          {
            id: 'post-1',
            kind: 'generated_post',
            previewUrl: 'https://example.com/generated-post.png',
            captionText: 'Fresh coffee, now pouring.',
            createdAt: '2026-04-29T10:00:00.000Z',
          },
        ],
      }))
    generatePostMock.mockResolvedValue({
      generation_mode: 'initial',
      post: {
        id: 'post-1',
      },
    })

    const { container } = render(<App />)

    const promptInput = await screen.findByPlaceholderText('Describe what you want to create...')
    fireEvent.change(promptInput, {
      target: { value: 'Create a launch post for our new coffee line' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit prompt' }))

    await waitFor(() => {
      const generatedLayer = container.querySelector('[data-generated-post-id="post-1"]')

      expect(generatedLayer).toBeInTheDocument()
      expect(generatedLayer).toHaveStyle({
        width: '1080px',
        height: '1350px',
      })
    })
  })

  it('resizes the canvas from the selected chat generated post dimensions', async () => {
    listChatsMock.mockResolvedValue([
      createChatSummary('chat-square', 'Square post'),
      createChatSummary('chat-story', 'Story post'),
    ])
    loadChatSessionMock.mockImplementation(async (chatId) => {
      if (chatId === 'chat-story') {
        return createChatSession('chat-story', 'Story post', {
          latestGeneratedPost: {
            id: 'post-story',
            chat_id: 'chat-story',
            bucket_name: 'generated-posts',
            image_storage_path: 'user/renders/post-story.png',
            previewUrl: 'https://example.com/generated-story.png',
            width: 1080,
            height: 1920,
          },
          timelineEntries: [],
        })
      }

      return createChatSession('chat-square', 'Square post', {
        latestGeneratedPost: {
          id: 'post-square',
          chat_id: 'chat-square',
          bucket_name: 'generated-posts',
          image_storage_path: 'user/renders/post-square.png',
          previewUrl: 'https://example.com/generated-square.png',
          width: 1080,
          height: 1080,
        },
        timelineEntries: [],
      })
    })

    const { container } = render(<App />)

    await waitFor(() => {
      const squareLayer = container.querySelector('[data-generated-post-id="post-square"]')

      expect(squareLayer).toBeInTheDocument()
      expect(squareLayer).toHaveStyle({
        width: '1080px',
        height: '1080px',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Story post' }))

    await waitFor(() => {
      const storyLayer = container.querySelector('[data-generated-post-id="post-story"]')

      expect(storyLayer).toBeInTheDocument()
      expect(storyLayer).toHaveStyle({
        width: '1080px',
        height: '1920px',
      })
      expect(container.querySelector('.canvas-surface')).toHaveStyle({
        width: '1080px',
        height: '1920px',
      })
    })
  })
})
