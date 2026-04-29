import { describe, expect, it, beforeEach, vi } from 'vitest'

const {
  invokeEdgeFunctionMock,
  getRequiredSupabaseClientMock,
  createSignedAssetPreviewMock,
  createSignedStorageUrlMock,
  uploadAssetFileMock,
} = vi.hoisted(() => ({
  invokeEdgeFunctionMock: vi.fn(),
  getRequiredSupabaseClientMock: vi.fn(),
  createSignedAssetPreviewMock: vi.fn(),
  createSignedStorageUrlMock: vi.fn(),
  uploadAssetFileMock: vi.fn(),
}))

vi.mock('./storageAssets', () => ({
  invokeEdgeFunction: invokeEdgeFunctionMock,
  getRequiredSupabaseClient: getRequiredSupabaseClientMock,
  createSignedAssetPreview: createSignedAssetPreviewMock,
  createSignedStorageUrl: createSignedStorageUrlMock,
  uploadAssetFile: uploadAssetFileMock,
}))

function createOrderQuery(result) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(async () => result),
  }

  return chain
}

function createMaybeSingleQuery(result) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  }

  return chain
}

describe('chatSessions', () => {
  beforeEach(() => {
    vi.resetModules()
    invokeEdgeFunctionMock.mockReset()
    getRequiredSupabaseClientMock.mockReset()
    createSignedAssetPreviewMock.mockReset()
    createSignedStorageUrlMock.mockReset()
    uploadAssetFileMock.mockReset()
  })

  it('builds a chat title from the first prompt text', async () => {
    const { buildChatTitleFromPrompt } = await import('./chatSessions')

    expect(buildChatTitleFromPrompt('Create a carousel for our new menu item')).toBe(
      'Create a carousel for our new menu item',
    )
    expect(buildChatTitleFromPrompt('')).toBe('Untitled chat')
    expect(buildChatTitleFromPrompt('x'.repeat(80))).toMatch(/\.\.\.$/)
  })

  it('lists chats with latest previews and generated thumbnail URLs', async () => {
    const chatsQuery = createOrderQuery({
      data: [
        {
          id: 'chat-1',
          title: 'Morning drop',
          last_message_at: '2026-04-28T12:05:00.000Z',
          updated_at: '2026-04-28T12:05:00.000Z',
          created_at: '2026-04-28T12:00:00.000Z',
        },
      ],
      error: null,
    })
    const messagesQuery = createOrderQuery({
      data: [
        {
          id: 'message-1',
          chat_id: 'chat-1',
          content_text: 'Fresh roast landing this week.',
          metadata: {},
          created_at: '2026-04-28T12:04:00.000Z',
        },
      ],
      error: null,
    })
    const postsQuery = createOrderQuery({
      data: [
        {
          id: 'post-1',
          chat_id: 'chat-1',
          caption_text: 'Fresh roast landing this week.',
          bucket_name: 'generated-posts',
          image_storage_path: 'user-1/renders/post-1.png',
          created_at: '2026-04-28T12:05:00.000Z',
        },
      ],
      error: null,
    })

    const supabase = {
      from: vi.fn((table) => {
        if (table === 'chats') {
          return { select: vi.fn(() => chatsQuery) }
        }

        if (table === 'chat_messages') {
          return { select: vi.fn(() => messagesQuery) }
        }

        if (table === 'generated_posts') {
          return { select: vi.fn(() => postsQuery) }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    getRequiredSupabaseClientMock.mockReturnValue(supabase)
    createSignedStorageUrlMock.mockResolvedValue('https://example.com/post-1.png')

    const { listChats } = await import('./chatSessions')
    const chats = await listChats()

    expect(chats).toEqual([
      expect.objectContaining({
        id: 'chat-1',
        title: 'Morning drop',
        subtitle: 'Fresh roast landing this week.',
        thumbnailSrc: 'https://example.com/post-1.png',
        thumbnailLabel: 'MD',
      }),
    ])
  })

  it('prefers the newest chat activity when building sidebar previews and order', async () => {
    const chatsQuery = createOrderQuery({
      data: [
        {
          id: 'chat-1',
          title: 'Generated first',
          last_message_at: '2026-04-28T12:01:00.000Z',
          updated_at: '2026-04-28T12:01:00.000Z',
          created_at: '2026-04-28T12:00:00.000Z',
        },
        {
          id: 'chat-2',
          title: 'Prompt second',
          last_message_at: '2026-04-28T12:02:00.000Z',
          updated_at: '2026-04-28T12:02:00.000Z',
          created_at: '2026-04-28T12:00:00.000Z',
        },
      ],
      error: null,
    })
    const messagesQuery = createOrderQuery({
      data: [
        {
          id: 'message-2',
          chat_id: 'chat-2',
          content_text: 'Move the headline lower.',
          metadata: {},
          created_at: '2026-04-28T12:05:00.000Z',
        },
        {
          id: 'message-1',
          chat_id: 'chat-1',
          content_text: 'Initial prompt text',
          metadata: {},
          created_at: '2026-04-28T12:01:00.000Z',
        },
      ],
      error: null,
    })
    const postsQuery = createOrderQuery({
      data: [
        {
          id: 'post-1',
          chat_id: 'chat-1',
          caption_text: 'Older generated caption',
          bucket_name: 'generated-posts',
          image_storage_path: 'user-1/renders/post-1.png',
          created_at: '2026-04-28T12:04:00.000Z',
        },
        {
          id: 'post-2',
          chat_id: 'chat-2',
          caption_text: 'Generated caption that should not override the newer user prompt',
          bucket_name: null,
          image_storage_path: null,
          created_at: '2026-04-28T12:03:00.000Z',
        },
      ],
      error: null,
    })

    const supabase = {
      from: vi.fn((table) => {
        if (table === 'chats') {
          return { select: vi.fn(() => chatsQuery) }
        }

        if (table === 'chat_messages') {
          return { select: vi.fn(() => messagesQuery) }
        }

        if (table === 'generated_posts') {
          return { select: vi.fn(() => postsQuery) }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    getRequiredSupabaseClientMock.mockReturnValue(supabase)
    createSignedStorageUrlMock.mockResolvedValue('https://example.com/post-1.png')

    const { listChats } = await import('./chatSessions')
    const chats = await listChats()

    expect(chats.map((chat) => chat.id)).toEqual(['chat-2', 'chat-1'])
    expect(chats[0].subtitle).toBe('Move the headline lower.')
    expect(chats[1].subtitle).toBe('Older generated caption')
  })

  it('loads a chat session with message attachments and generated results', async () => {
    const chatQuery = createMaybeSingleQuery({
      data: {
        id: 'chat-1',
        title: 'Morning drop',
        status: 'active',
      },
      error: null,
    })
    const messagesQuery = createOrderQuery({
      data: [
        {
          id: 'message-1',
          chat_id: 'chat-1',
          role: 'user',
          message_type: 'text',
          content_text: 'Create a post for our new coffee beans.',
          metadata: {
            attachment_asset_ids: ['asset-1'],
          },
          created_at: '2026-04-28T12:00:00.000Z',
        },
      ],
      error: null,
    })
    const generatedPostsQuery = createOrderQuery({
      data: [
        {
          id: 'post-1',
          chat_id: 'chat-1',
          source_message_id: 'message-1',
          status: 'draft',
          prompt_text: 'Create a post',
          caption_text: 'Fresh roast landing this week.',
          bucket_name: 'generated-posts',
          image_storage_path: 'user-1/renders/post-1.png',
          width: 1080,
          height: 1080,
          metadata: {},
          created_at: '2026-04-28T12:02:00.000Z',
        },
      ],
      error: null,
    })
    const assetsQuery = createOrderQuery({
      data: [
        {
          id: 'asset-1',
          original_file_name: 'beans.png',
          bucket_name: 'chat-assets',
          storage_path: 'user-1/attachments/beans.png',
        },
      ],
      error: null,
    })

    const supabase = {
      from: vi.fn((table) => {
        if (table === 'chats') {
          return { select: vi.fn(() => chatQuery) }
        }

        if (table === 'chat_messages') {
          return { select: vi.fn(() => messagesQuery) }
        }

        if (table === 'generated_posts') {
          return { select: vi.fn(() => generatedPostsQuery) }
        }

        if (table === 'uploaded_assets') {
          return { select: vi.fn(() => assetsQuery) }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    getRequiredSupabaseClientMock.mockReturnValue(supabase)
    createSignedAssetPreviewMock.mockResolvedValue({
      id: 'asset-1',
      original_file_name: 'beans.png',
      previewUrl: 'https://example.com/beans.png',
    })
    createSignedStorageUrlMock.mockResolvedValue('https://example.com/post-1.png')

    const { loadChatSession } = await import('./chatSessions')
    const session = await loadChatSession('chat-1')

    expect(session.chat).toMatchObject({
      id: 'chat-1',
      title: 'Morning drop',
    })
    expect(session.timelineEntries).toEqual([
      expect.objectContaining({
        kind: 'message',
        text: 'Create a post for our new coffee beans.',
        attachments: [
          expect.objectContaining({
            id: 'asset-1',
            previewUrl: 'https://example.com/beans.png',
          }),
        ],
      }),
      expect.objectContaining({
        kind: 'generated_post',
        captionText: 'Fresh roast landing this week.',
        previewUrl: 'https://example.com/post-1.png',
      }),
    ])
  })

  it('saves user prompts and uploads prompt attachments', async () => {
    const insertResult = {
      data: {
        id: 'message-1',
        chat_id: 'chat-1',
        role: 'user',
        message_type: 'text',
        content_text: 'Create a post',
        metadata: {
          attachment_asset_ids: ['asset-1'],
        },
        created_at: '2026-04-28T12:00:00.000Z',
      },
      error: null,
    }
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'chat_messages') {
          return {
            insert: vi.fn((payload) => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  expect(payload).toMatchObject({
                    chat_id: 'chat-1',
                    content_text: 'Create a post',
                    metadata: {
                      attachment_asset_ids: ['asset-1'],
                    },
                  })

                  return insertResult
                }),
              })),
            })),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    getRequiredSupabaseClientMock.mockReturnValue(supabase)
    uploadAssetFileMock.mockResolvedValue({
      id: 'asset-2',
      bucket_name: 'chat-assets',
      storage_path: 'user-1/attachments/asset-2.png',
    })
    createSignedAssetPreviewMock.mockResolvedValue({
      id: 'asset-2',
      previewUrl: 'https://example.com/asset-2.png',
    })

    const { submitUserPrompt, uploadPromptAttachment } = await import('./chatSessions')
    const message = await submitUserPrompt({
      chatId: 'chat-1',
      prompt: 'Create a post',
      attachmentAssetIds: ['asset-1', 'asset-1'],
    })
    const attachment = await uploadPromptAttachment(
      'chat-1',
      new File(['image'], 'asset-2.png', { type: 'image/png' }),
    )

    expect(message).toMatchObject({
      id: 'message-1',
      chat_id: 'chat-1',
    })
    expect(uploadAssetFileMock).toHaveBeenCalledWith({
      file: expect.any(File),
      assetKind: 'prompt_attachment',
      chatId: 'chat-1',
    })
    expect(attachment).toMatchObject({
      id: 'asset-2',
      previewUrl: 'https://example.com/asset-2.png',
    })
  })

  it('creates chats with the authenticated user id for RLS inserts', async () => {
    const insertResult = {
      data: {
        id: 'chat-1',
        user_id: 'user-1',
        title: 'Campaign ideas',
        status: 'active',
      },
      error: null,
    }
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: 'user-1',
            },
          },
          error: null,
        })),
      },
      from: vi.fn((table) => {
        if (table === 'chats') {
          return {
            insert: vi.fn((payload) => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  expect(payload).toMatchObject({
                    user_id: 'user-1',
                    title: 'Campaign ideas',
                    business_profile_id: null,
                  })

                  return insertResult
                }),
              })),
            })),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    getRequiredSupabaseClientMock.mockReturnValue(supabase)

    const { createChat } = await import('./chatSessions')
    const chat = await createChat({
      title: 'Campaign ideas',
    })

    expect(chat).toMatchObject({
      id: 'chat-1',
      user_id: 'user-1',
    })
  })

  it('invokes the generate-post edge function with normalized data', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      post: {
        id: 'post-1',
      },
    })

    const { generatePost } = await import('./chatSessions')
    const result = await generatePost({
      chatId: 'chat-1',
      prompt: '  Create a launch post  ',
      width: 1080,
      height: 1350,
      businessProfileId: 'profile-1',
      attachmentAssetIds: ['asset-1', 'asset-1', 'asset-2'],
    })

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith(
      'generate-post',
      {
        chat_id: 'chat-1',
        prompt: 'Create a launch post',
        width: 1080,
        height: 1350,
        business_profile_id: 'profile-1',
        attachment_asset_ids: ['asset-1', 'asset-2'],
      },
      'Unable to generate the post.',
      { signal: null },
    )
    expect(result).toMatchObject({
      post: {
        id: 'post-1',
      },
    })
  })

  it('loads generation job status through the status edge function', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      job: {
        id: 'job-1',
        status: 'processing',
      },
    })

    const { getGenerationJobStatus } = await import('./chatSessions')
    const result = await getGenerationJobStatus(' job-1 ')

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith(
      'generation-job-status',
      {
        job_id: 'job-1',
      },
      'Unable to load generation status.',
      { signal: null },
    )
    expect(result).toMatchObject({
      job: {
        status: 'processing',
      },
    })
  })

  it('returns when a generation job reaches completed state', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      job: {
        id: 'job-1',
        status: 'completed',
      },
    })

    const { waitForGenerationJob } = await import('./chatSessions')
    const result = await waitForGenerationJob('job-1')

    expect(result).toMatchObject({
      job: {
        status: 'completed',
      },
    })
  })

  it('throws the safe assistant message when a generation job fails', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      job: {
        id: 'job-1',
        status: 'failed',
        error_message: 'Raw provider failure',
      },
      assistant_message: {
        content_text: 'Image generation timed out. Please try again.',
      },
    })

    const { waitForGenerationJob } = await import('./chatSessions')

    await expect(waitForGenerationJob('job-1')).rejects.toThrow(
      'Image generation timed out. Please try again.',
    )
  })

  it('invokes the cancel-generation-job edge function', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      job: {
        id: 'job-1',
        status: 'canceled',
      },
      canceled: true,
    })

    const { cancelGenerationJob } = await import('./chatSessions')
    const result = await cancelGenerationJob(' job-1 ')

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith(
      'cancel-generation-job',
      {
        job_id: 'job-1',
      },
      'Unable to stop generation.',
      { signal: null },
    )
    expect(result).toMatchObject({
      canceled: true,
      job: {
        status: 'canceled',
      },
    })
  })

  it('throws when a generation job reaches canceled state while polling', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      job: {
        id: 'job-1',
        status: 'canceled',
      },
    })

    const { waitForGenerationJob } = await import('./chatSessions')

    await expect(waitForGenerationJob('job-1')).rejects.toThrow('Generation was stopped.')
  })
})
