import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const {
  buildChatTitleFromPromptMock,
  createChatMock,
  deleteChatMock,
  listChatsMock,
  loadChatSessionMock,
  renameChatMock,
  submitUserPromptMock,
  uploadPromptAttachmentMock,
} = vi.hoisted(() => ({
  buildChatTitleFromPromptMock: vi.fn(),
  createChatMock: vi.fn(),
  deleteChatMock: vi.fn(),
  listChatsMock: vi.fn(),
  loadChatSessionMock: vi.fn(),
  renameChatMock: vi.fn(),
  submitUserPromptMock: vi.fn(),
  uploadPromptAttachmentMock: vi.fn(),
}))

vi.mock('./lib/chatSessions', () => ({
  buildChatTitleFromPrompt: buildChatTitleFromPromptMock,
  createChat: createChatMock,
  deleteChat: deleteChatMock,
  listChats: listChatsMock,
  loadChatSession: loadChatSessionMock,
  renameChat: renameChatMock,
  submitUserPrompt: submitUserPromptMock,
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

function createChatSession(id, title) {
  return {
    chat: {
      id,
      title,
      status: 'active',
    },
    timelineEntries: [],
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
    buildChatTitleFromPromptMock.mockReset()
    createChatMock.mockReset()
    deleteChatMock.mockReset()
    listChatsMock.mockReset()
    loadChatSessionMock.mockReset()
    renameChatMock.mockReset()
    submitUserPromptMock.mockReset()
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
    loadChatSessionMock.mockResolvedValue(createChatSession('chat-1', 'Campaign ideas'))
    submitUserPromptMock.mockReturnValue(submitDeferred.promise)
    renameChatMock.mockResolvedValue(undefined)

    render(<App />)

    const promptInput = await screen.findByPlaceholderText('Describe what you want to create...')
    fireEvent.change(promptInput, {
      target: { value: 'Create a launch post for our new coffee line' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit prompt' }))

    await waitFor(() => {
      expect(submitUserPromptMock).toHaveBeenCalledWith({
        chatId: 'chat-1',
        prompt: 'Create a launch post for our new coffee line',
        attachmentAssetIds: [],
      })
      expect(screen.getByPlaceholderText('Describe what you want to create...')).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Add image' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Submit prompt' })).toBeDisabled()
    })

    submitDeferred.resolve({
      id: 'message-1',
      chat_id: 'chat-1',
      role: 'user',
      content_text: 'Create a launch post for our new coffee line',
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Describe what you want to create...')).not.toBeDisabled()
    })
  })
})
