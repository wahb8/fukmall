import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const {
  createChatMock,
  cancelGenerationJobMock,
  deleteChatMock,
  generatePostMock,
  listChatsMock,
  loadChatSessionMock,
  renameChatMock,
  exportDocumentImageMock,
  uploadPromptAttachmentMock,
  waitForGenerationJobMock,
} = vi.hoisted(() => ({
  createChatMock: vi.fn(),
  cancelGenerationJobMock: vi.fn(),
  deleteChatMock: vi.fn(),
  generatePostMock: vi.fn(),
  listChatsMock: vi.fn(),
  loadChatSessionMock: vi.fn(),
  renameChatMock: vi.fn(),
  exportDocumentImageMock: vi.fn(),
  uploadPromptAttachmentMock: vi.fn(),
  waitForGenerationJobMock: vi.fn(),
}))

vi.mock('./lib/chatSessions', () => ({
  cancelGenerationJob: cancelGenerationJobMock,
  createChat: createChatMock,
  deleteChat: deleteChatMock,
  generatePost: generatePostMock,
  listChats: listChatsMock,
  loadChatSession: loadChatSessionMock,
  renameChat: renameChatMock,
  uploadPromptAttachment: uploadPromptAttachmentMock,
  waitForGenerationJob: waitForGenerationJobMock,
}))

vi.mock('./lib/exportDocument', () => ({
  exportDocumentImage: exportDocumentImageMock,
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
    cancelGenerationJobMock.mockReset()
    deleteChatMock.mockReset()
    generatePostMock.mockReset()
    listChatsMock.mockReset()
    loadChatSessionMock.mockReset()
    renameChatMock.mockReset()
    exportDocumentImageMock.mockReset()
    uploadPromptAttachmentMock.mockReset()
    waitForGenerationJobMock.mockReset()
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

  it('keeps the right chat panel hidden by default', async () => {
    listChatsMock.mockResolvedValue([])

    render(<App />)

    await waitFor(() => {
      expect(listChatsMock).toHaveBeenCalled()
    })

    expect(screen.queryByLabelText('Conversation')).toBeNull()
    expect(screen.getByLabelText('Instagram caption preview')).toBeInTheDocument()
  })

  it('shows the right chat panel when the workspace setting is enabled', async () => {
    window.localStorage.setItem('fukmall.show-chat-panel', 'true')
    listChatsMock.mockResolvedValue([])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByLabelText('Conversation')).toBeInTheDocument()
    })
  })

  it('downloads the current canvas from the bottom hover panel as PNG and JPG', async () => {
    listChatsMock.mockResolvedValue([
      createChatSummary('chat-1', 'Campaign ideas'),
    ])
    loadChatSessionMock.mockResolvedValue(createChatSession('chat-1', 'Campaign ideas', {
      latestGeneratedPost: {
        id: 'post-1',
        chat_id: 'chat-1',
        bucket_name: 'generated-posts',
        image_storage_path: 'user/renders/post-1.png',
        previewUrl: 'https://example.com/generated-post.png',
        width: 1080,
        height: 1350,
      },
      timelineEntries: [],
    }))
    exportDocumentImageMock.mockResolvedValue(undefined)

    const { container } = render(<App />)

    await waitFor(() => {
      expect(container.querySelector('[data-generated-post-id="post-1"]')).toBeInTheDocument()
    })

    fireEvent.click(await screen.findByRole('button', { name: 'PNG' }))

    await waitFor(() => {
      expect(exportDocumentImageMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          width: 1080,
          height: 1350,
        }),
        1080,
        1350,
        'png',
        expect.any(String),
      )
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'JPG' })).not.toBeDisabled()
    })
    fireEvent.click(screen.getByRole('button', { name: 'JPG' }))

    await waitFor(() => {
      expect(exportDocumentImageMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          width: 1080,
          height: 1350,
        }),
        1080,
        1350,
        'jpeg',
        expect.any(String),
      )
    })
  })

  it('anchors prompt image attachments to the canvas instead of between the canvas and prompt input', async () => {
    listChatsMock.mockResolvedValue([])
    createChatMock.mockResolvedValue({
      id: 'chat-1',
    })
    uploadPromptAttachmentMock.mockResolvedValue({
      id: 'asset-1',
      original_file_name: 'coffee.png',
      previewUrl: 'https://example.com/coffee.png',
    })

    const { container } = render(<App />)
    let fileInput = null

    await waitFor(() => {
      fileInput = container.querySelector('input[type="file"][accept="image/*"][multiple]')
      expect(fileInput).not.toBeNull()
    })

    const file = new File(['image'], 'coffee.png', { type: 'image/png' })

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(uploadPromptAttachmentMock).toHaveBeenCalledWith('chat-1', file)
    })

    let attachmentTabs = null

    await waitFor(() => {
      attachmentTabs = container.querySelector('.canvas-attachment-tabs')
      expect(attachmentTabs).not.toBeNull()
    })

    expect(attachmentTabs.closest('.canvas-composer-shell')).not.toBeNull()
    expect(attachmentTabs.closest('.canvas-prompt-stack')).toBeNull()
    expect(screen.getByAltText('coffee.png')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove coffee.png' })).toBeInTheDocument()
  })

  it('shows pending attachment placeholders and blocks sending until attachments are ready', async () => {
    const uploadDeferred = createDeferred()

    listChatsMock.mockResolvedValue([])
    createChatMock.mockResolvedValue({
      id: 'chat-1',
    })
    loadChatSessionMock.mockResolvedValue(createChatSession('chat-1', 'Campaign ideas'))
    uploadPromptAttachmentMock.mockReturnValue(uploadDeferred.promise)
    generatePostMock.mockResolvedValue({
      generation_mode: 'initial',
      job: {
        id: 'job-1',
        status: 'completed',
      },
    })

    const { container } = render(<App />)
    const promptInput = await screen.findByPlaceholderText('Describe what you want to create...')

    fireEvent.change(promptInput, {
      target: { value: 'Create a coffee launch post' },
    })

    const fileInput = container.querySelector('input[type="file"][accept="image/*"][multiple]')
    const file = new File(['image'], 'coffee.png', { type: 'image/png' })

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Loading coffee.png' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Submit prompt' })).toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit prompt' }))
    expect(generatePostMock).not.toHaveBeenCalled()

    uploadDeferred.resolve({
      id: 'asset-1',
      original_file_name: 'coffee.png',
      previewUrl: 'https://example.com/coffee.png',
    })

    let attachedImage = null

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Loading coffee.png' })).toBeInTheDocument()
      attachedImage = screen.getByAltText('coffee.png')
      expect(attachedImage).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Submit prompt' })).toBeDisabled()
    })

    fireEvent.load(attachedImage)

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading coffee.png' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Submit prompt' })).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit prompt' }))

    await waitFor(() => {
      expect(generatePostMock).toHaveBeenCalledWith(expect.objectContaining({
        chatId: 'chat-1',
        prompt: 'Create a coffee launch post',
        attachmentAssetIds: ['asset-1'],
      }))
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
    waitForGenerationJobMock.mockResolvedValue({
      job: {
        id: 'job-1',
        status: 'completed',
      },
    })

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
      expect(screen.getByRole('button', { name: 'Stop generating' })).not.toBeDisabled()
      expect(screen.getByRole('status', { name: 'Creating your post' })).toBeInTheDocument()
      expect(screen.queryByText('Creating your post...')).not.toBeInTheDocument()
    })

    submitDeferred.resolve({
      generation_mode: 'initial',
      job: {
        id: 'job-1',
        status: 'pending',
      },
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Describe what you want to create...')).not.toBeDisabled()
    })
  })

  it('stops an active prompt generation from the send button', async () => {
    listChatsMock.mockResolvedValue([
      createChatSummary('chat-1', 'Campaign ideas'),
    ])
    loadChatSessionMock.mockResolvedValue(createChatSession('chat-1', 'Campaign ideas'))
    generatePostMock.mockResolvedValue({
      generation_mode: 'initial',
      job: {
        id: 'job-1',
        status: 'pending',
      },
    })
    waitForGenerationJobMock.mockImplementation((_jobId, options = {}) => (
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })
    ))
    cancelGenerationJobMock.mockResolvedValue({
      job: {
        id: 'job-1',
        status: 'canceled',
      },
      canceled: true,
    })

    render(<App />)

    const promptInput = await screen.findByPlaceholderText('Describe what you want to create...')
    fireEvent.change(promptInput, {
      target: { value: 'Create a launch post for our new coffee line' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit prompt' }))

    const stopButton = await screen.findByRole('button', { name: 'Stop generating' })
    await waitFor(() => {
      expect(waitForGenerationJobMock).toHaveBeenCalledWith('job-1', {
        signal: expect.any(AbortSignal),
      })
    })
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(cancelGenerationJobMock).toHaveBeenCalledWith('job-1')
      expect(screen.getByRole('button', { name: 'Submit prompt' })).not.toBeDisabled()
      expect(screen.queryByRole('status', { name: 'Creating your post' })).not.toBeInTheDocument()
    })
  })

  it('cancels a stopped generation after the backend returns a delayed job id', async () => {
    const startDeferred = createDeferred()

    listChatsMock.mockResolvedValue([
      createChatSummary('chat-1', 'Campaign ideas'),
    ])
    loadChatSessionMock.mockResolvedValue(createChatSession('chat-1', 'Campaign ideas'))
    generatePostMock.mockReturnValue(startDeferred.promise)
    cancelGenerationJobMock.mockResolvedValue({
      job: {
        id: 'job-delayed',
        status: 'canceled',
      },
      canceled: true,
    })

    render(<App />)

    const promptInput = await screen.findByPlaceholderText('Describe what you want to create...')
    fireEvent.change(promptInput, {
      target: { value: 'Create a launch post for our new coffee line' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit prompt' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Stop generating' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit prompt' })).not.toBeDisabled()
    })

    startDeferred.resolve({
      generation_mode: 'initial',
      job: {
        id: 'job-delayed',
        status: 'pending',
      },
    })

    await waitFor(() => {
      expect(cancelGenerationJobMock).toHaveBeenCalledWith('job-delayed')
      expect(waitForGenerationJobMock).not.toHaveBeenCalled()
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
      job: {
        id: 'job-1',
        status: 'pending',
      },
    })
    waitForGenerationJobMock.mockResolvedValue({
      job: {
        id: 'job-1',
        status: 'completed',
        output_post_id: 'post-1',
      },
    })

    const { container } = render(<App />)

    const promptInput = await screen.findByPlaceholderText('Describe what you want to create...')
    fireEvent.change(promptInput, {
      target: { value: 'Create a launch post for our new coffee line' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit prompt' }))

    await waitFor(() => {
      expect(waitForGenerationJobMock).toHaveBeenCalledWith('job-1', {
        signal: expect.any(AbortSignal),
      })
    })

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
