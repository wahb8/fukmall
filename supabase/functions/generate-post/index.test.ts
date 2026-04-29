import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireAuthenticatedUserMock = vi.fn()
const createAdminClientMock = vi.fn()
const getActiveSubscriptionWithPlanMock = vi.fn()
const getOrCreateUsagePeriodMock = vi.fn()
const assertGenerationAllowedMock = vi.fn()
const assertEditAllowedMock = vi.fn()
const assertStorageAllowedMock = vi.fn()
const recordUsageEventMock = vi.fn()
const generatePostImageMock = vi.fn()
const generateCaptionMock = vi.fn()
const buildImageGenerationInstructionsMock = vi.fn(() => 'image instructions')
const buildImageGenerationUserPromptMock = vi.fn(() => 'image prompt')
const buildCaptionInstructionsMock = vi.fn(() => 'caption instructions')
const buildCaptionUserPromptMock = vi.fn(() => 'caption prompt')
const buildAssistantSummaryTextMock = vi.fn((mode: string) => (
  mode === 'edit' ? 'Updated the post draft.' : 'Generated a new post draft.'
))
const buildSafeGenerationErrorMessageMock = vi.fn(() => 'Generation failed safely.')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CHAT_ID = '22222222-2222-4222-8222-222222222222'
const BUSINESS_PROFILE_ID = '33333333-3333-4333-8333-333333333333'
const ATTACHMENT_ASSET_ID = '44444444-4444-4444-8444-444444444444'
const BRAND_REFERENCE_ASSET_ID = '55555555-5555-4555-8555-555555555555'
const USER_MESSAGE_ID = '66666666-6666-4666-8666-666666666666'
const ASSISTANT_MESSAGE_ID = '77777777-7777-4777-8777-777777777777'
const GENERATION_JOB_ID = '88888888-8888-4888-8888-888888888888'
const GENERATED_POST_ID = '99999999-9999-4999-8999-999999999999'
const PREVIOUS_POST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const VERSION_GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NEXT_GENERATED_POST_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

vi.mock('../_shared/auth.ts', () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

vi.mock('../_shared/supabase.ts', () => ({
  createAdminClient: createAdminClientMock,
}))

vi.mock('../_shared/plans.ts', () => ({
  getActiveSubscriptionWithPlan: getActiveSubscriptionWithPlanMock,
}))

vi.mock('../_shared/usage.ts', () => ({
  getOrCreateUsagePeriod: getOrCreateUsagePeriodMock,
  assertGenerationAllowed: assertGenerationAllowedMock,
  assertEditAllowed: assertEditAllowedMock,
  assertStorageAllowed: assertStorageAllowedMock,
  recordUsageEvent: recordUsageEventMock,
}))

vi.mock('../_shared/openai.ts', () => ({
  generatePostImage: generatePostImageMock,
  generateCaption: generateCaptionMock,
  resolveRequestedImageCanvas: vi.fn((width: number, height: number) => ({
    requestedSize: `${width}x${height}`,
    outputWidth: width,
    outputHeight: height,
    aspectRatioLabel: width === height ? '1:1' : '4:5',
  })),
}))

vi.mock('../_shared/promptTemplates.ts', () => ({
  buildImageGenerationInstructions: buildImageGenerationInstructionsMock,
  buildImageGenerationUserPrompt: buildImageGenerationUserPromptMock,
  buildCaptionInstructions: buildCaptionInstructionsMock,
  buildCaptionUserPrompt: buildCaptionUserPromptMock,
  buildAssistantSummaryText: buildAssistantSummaryTextMock,
  buildSafeGenerationErrorMessage: buildSafeGenerationErrorMessageMock,
}))

function createMaybeSingleQuery(result: { data: unknown, error: unknown }) {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  }

  return chain
}

function createListQuery(result: { data: unknown, error: unknown }) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => result),
    then: (onFulfilled: (value: typeof result) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }

  return chain
}

function createSequentialInsertTable(
  results: Array<{ data: unknown, error: unknown }>,
  payloadRecorder: unknown[],
) {
  return {
    insert: vi.fn((payload) => {
      payloadRecorder.push(payload)
      const nextResult = results.shift()

      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => nextResult),
        })),
      }
    }),
  }
}

function createDoubleEqMutationTable(payloadRecorder: unknown[]) {
  const secondEq = vi.fn(async () => ({
    error: null,
  }))
  const firstEq = vi.fn(() => ({
    eq: secondEq,
  }))

  return {
    update: vi.fn((payload) => {
      payloadRecorder.push(payload)

      return {
        eq: firstEq,
      }
    }),
    delete: vi.fn(() => ({
      eq: firstEq,
    })),
    firstEq,
    secondEq,
  }
}

async function loadHandler() {
  vi.resetModules()

  let capturedHandler: ((request: Request) => Promise<Response>) | null = null
  globalThis.Deno = {
    serve: vi.fn((handler) => {
      capturedHandler = handler
    }),
  } as unknown as typeof Deno

  await import('./index.ts')

  if (!capturedHandler) {
    throw new Error('Handler was not registered.')
  }

  return capturedHandler
}

function createStorageMock() {
  const uploadCalls: Array<{ bucketName: string, path: string, byteLength: number }> = []
  const removeCalls: Array<{ bucketName: string, paths: string[] }> = []
  const signedUrlCalls: Array<{ bucketName: string, path: string }> = []

  const from = vi.fn((bucketName: string) => ({
    createSignedUrl: vi.fn(async (path: string) => {
      signedUrlCalls.push({ bucketName, path })
      return {
        data: {
          signedUrl: `https://signed.example/${bucketName}/${path}`,
        },
        error: null,
      }
    }),
    upload: vi.fn(async (path: string, bytes: Uint8Array) => {
      uploadCalls.push({
        bucketName,
        path,
        byteLength: bytes.byteLength,
      })
      return {
        error: null,
      }
    }),
    remove: vi.fn(async (paths: string[]) => {
      removeCalls.push({ bucketName, paths })
      return {
        error: null,
      }
    }),
  }))

  return {
    storage: { from },
    uploadCalls,
    removeCalls,
    signedUrlCalls,
  }
}

describe('generate-post edge function', () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockReset()
    createAdminClientMock.mockReset()
    getActiveSubscriptionWithPlanMock.mockReset()
    getOrCreateUsagePeriodMock.mockReset()
    assertGenerationAllowedMock.mockReset()
    assertEditAllowedMock.mockReset()
    assertStorageAllowedMock.mockReset()
    recordUsageEventMock.mockReset()
    generatePostImageMock.mockReset()
    generateCaptionMock.mockReset()
    buildImageGenerationInstructionsMock.mockClear()
    buildImageGenerationUserPromptMock.mockClear()
    buildCaptionInstructionsMock.mockClear()
    buildCaptionUserPromptMock.mockClear()
    buildAssistantSummaryTextMock.mockClear()
    buildSafeGenerationErrorMessageMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an initial generated post, assistant response, and usage records', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(GENERATED_POST_ID)
    const chatsUpdatePayloads: unknown[] = []
    const generationJobUpdatePayloads: unknown[] = []
    const chatMessagePayloads: unknown[] = []
    const generatedPostPayloads: unknown[] = []
    const chatsQuery = createMaybeSingleQuery({
      data: {
        id: CHAT_ID,
        user_id: USER_ID,
        business_profile_id: null,
        title: 'Untitled chat',
        status: 'active',
      },
      error: null,
    })
    const businessProfileQuery = createMaybeSingleQuery({
      data: {
        id: BUSINESS_PROFILE_ID,
        user_id: USER_ID,
        name: 'Moonline Cafe',
        business_type: 'Cafe',
        brand_description: 'A warm specialty coffee shop.',
        tone_preferences: ['Warm and friendly'],
        style_preferences: ['Editorial'],
        brand_colors: ['#f3b56a'],
        is_default: true,
      },
      error: null,
    })
    const attachmentAssetsQuery = createListQuery({
      data: [
        {
          id: ATTACHMENT_ASSET_ID,
          user_id: USER_ID,
          chat_id: CHAT_ID,
          asset_kind: 'prompt_attachment',
          bucket_name: 'chat-assets',
          storage_path: `${USER_ID}/attachments/${ATTACHMENT_ASSET_ID}.png`,
          mime_type: 'image/png',
          file_size_bytes: 1024,
        },
      ],
      error: null,
    })
    const brandReferenceAssetsQuery = createListQuery({
      data: [
        {
          id: BRAND_REFERENCE_ASSET_ID,
          user_id: USER_ID,
          business_profile_id: BUSINESS_PROFILE_ID,
          asset_kind: 'brand_reference',
          bucket_name: 'brand-assets',
          storage_path: `${USER_ID}/references/${BRAND_REFERENCE_ASSET_ID}.png`,
          mime_type: 'image/png',
          file_size_bytes: 2048,
        },
      ],
      error: null,
    })
    const latestPostQuery = createMaybeSingleQuery({
      data: null,
      error: null,
    })
    const chatMessagesTable = createSequentialInsertTable([
      {
        data: {
          id: USER_MESSAGE_ID,
          role: 'user',
          message_type: 'generation_request',
          content_text: 'Create a launch post',
          metadata: {},
          created_at: '2026-04-28T12:00:00.000Z',
        },
        error: null,
      },
      {
        data: {
          id: ASSISTANT_MESSAGE_ID,
          role: 'assistant',
          message_type: 'generation_result',
          content_text: 'Generated a new post draft.',
          metadata: {},
          created_at: '2026-04-28T12:01:00.000Z',
        },
        error: null,
      },
    ], chatMessagePayloads)
    const generationJobsTable = createSequentialInsertTable([
      {
        data: {
          id: GENERATION_JOB_ID,
          status: 'pending',
          queued_at: '2026-04-28T12:00:00.000Z',
          source_message_id: USER_MESSAGE_ID,
        },
        error: null,
      },
    ], [])
    const generatedPostsTable = createSequentialInsertTable([
      {
        data: {
          id: GENERATED_POST_ID,
          user_id: USER_ID,
          chat_id: CHAT_ID,
          version_group_id: GENERATED_POST_ID,
          version_number: 1,
          previous_post_id: null,
          caption_text: 'Fresh coffee, now pouring.',
          bucket_name: 'generated-posts',
          image_storage_path: `${USER_ID}/renders/${GENERATED_POST_ID}.png`,
          width: 1080,
          height: 1350,
          metadata: {},
          created_at: '2026-04-28T12:01:00.000Z',
        },
        error: null,
      },
    ], generatedPostPayloads)
    const chatsTable = {
      select: vi.fn(() => chatsQuery),
      ...createDoubleEqMutationTable(chatsUpdatePayloads),
    }
    const generationJobUpdates = createDoubleEqMutationTable(generationJobUpdatePayloads)
    const generatedPostDeletes = createDoubleEqMutationTable([])
    const chatMessageDeletes = createDoubleEqMutationTable([])
    const storageMock = createStorageMock()

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'chats') {
          return chatsTable
        }

                if (table === 'business_profiles') {
          return {
            select: vi.fn(() => businessProfileQuery),
          }
        }

        if (table === 'uploaded_assets') {
          const selectMock = vi.fn(() => {
            let isAttachmentQuery = false
            let isReferenceQuery = false

            const chain = {
              eq: vi.fn((field: string, value: unknown) => {
                if (field === 'user_id' && value === USER_ID) {
                  return chain
                }

                if (field === 'business_profile_id' && value === BUSINESS_PROFILE_ID) {
                  isReferenceQuery = true
                  return chain
                }

                if (field === 'asset_kind' && value === 'brand_reference') {
                  isReferenceQuery = true
                  return chain
                }

                return chain
              }),
              in: vi.fn(() => {
                isAttachmentQuery = true
                return attachmentAssetsQuery.in('id', [ATTACHMENT_ASSET_ID])
              }),
              order: vi.fn(() => ({
                limit: vi.fn(async () => {
                  if (isReferenceQuery) {
                    return brandReferenceAssetsQuery.limit(4)
                  }

                  throw new Error('Unexpected uploaded_assets order/limit query')
                }),
              })),
            }

            return chain
          })

          return {
            select: selectMock,
          }
        }

        if (table === 'generated_posts') {
          return {
            select: vi.fn(() => latestPostQuery),
            insert: generatedPostsTable.insert,
            delete: generatedPostDeletes.delete,
          }
        }

        if (table === 'chat_messages') {
          return {
            insert: chatMessagesTable.insert,
            delete: chatMessageDeletes.delete,
          }
        }

        if (table === 'generation_jobs') {
          return {
            insert: generationJobsTable.insert,
            update: generationJobUpdates.update,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: storageMock.storage,
    })
    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: USER_ID,
      },
    })
    getActiveSubscriptionWithPlanMock.mockResolvedValue({
      plan: {
        monthly_generation_limit: 30,
        monthly_edit_limit: 30,
      },
    })
    getOrCreateUsagePeriodMock.mockResolvedValue({
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      period_start: '2026-04-01T00:00:00.000Z',
      period_end: '2026-05-01T00:00:00.000Z',
      generation_count: 4,
      edit_count: 1,
    })
    generatePostImageMock.mockResolvedValue({
      model: 'gpt-image-2',
      responseId: 'resp-image-1',
      imageBase64: btoa('generated-image'),
      revisedPrompt: 'Revised prompt',
      outputWidth: 1080,
      outputHeight: 1350,
      requestedSize: '1080x1350',
      usage: {
        input_tokens: 10,
      },
    })
    generateCaptionMock.mockResolvedValue({
      responseId: 'resp-caption-1',
      caption: 'Fresh coffee, now pouring.',
      usage: {
        output_tokens: 12,
      },
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        prompt: 'Create a launch post',
        width: 1080,
        height: 1350,
        attachment_asset_ids: [ATTACHMENT_ASSET_ID],
      }),
    }))

    expect(response.status).toBe(200)
    expect(assertGenerationAllowedMock).toHaveBeenCalled()
    expect(assertEditAllowedMock).not.toHaveBeenCalled()
    expect(generatePostImageMock).toHaveBeenCalledWith(expect.objectContaining({
      requestedWidth: 1080,
      requestedHeight: 1350,
      referenceImageUrls: [
        `https://signed.example/brand-assets/${USER_ID}/references/${BRAND_REFERENCE_ASSET_ID}.png`,
        `https://signed.example/chat-assets/${USER_ID}/attachments/${ATTACHMENT_ASSET_ID}.png`,
      ],
    }))
    expect(storageMock.uploadCalls[0]).toMatchObject({
      bucketName: 'generated-posts',
      path: `${USER_ID}/renders/${GENERATED_POST_ID}.png`,
      byteLength: expect.any(Number),
    })
    expect(chatMessagePayloads[0]).toMatchObject({
      role: 'user',
      message_type: 'generation_request',
      content_text: 'Create a launch post',
    })
    expect(chatMessagePayloads[1]).toMatchObject({
      role: 'assistant',
      message_type: 'generation_result',
    })
    expect(generatedPostPayloads[0]).toMatchObject({
      previous_post_id: null,
      version_number: 1,
      status: 'draft',
      metadata: expect.objectContaining({
        openai_image_model: 'gpt-image-2',
      }),
    })
    expect(chatsUpdatePayloads).toEqual([
      { business_profile_id: BUSINESS_PROFILE_ID },
      { title: 'Create a launch post' },
    ])
    expect(generationJobUpdatePayloads[0]).toMatchObject({
      status: 'processing',
    })
    expect(generationJobUpdatePayloads[1]).toMatchObject({
      status: 'completed',
      model: 'gpt-image-2',
      output_post_id: GENERATED_POST_ID,
    })
    expect(recordUsageEventMock).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({
      eventType: 'storage_upload',
      resourceId: GENERATED_POST_ID,
    }))
    expect(recordUsageEventMock).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      eventType: 'generation',
      resourceId: GENERATED_POST_ID,
    }))

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        generation_mode: 'initial',
        post: {
          id: GENERATED_POST_ID,
        },
      },
    })
  })

  it('treats follow-up prompts as edits against the latest generated post', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(NEXT_GENERATED_POST_ID)
    const chatMessagePayloads: unknown[] = []
    const generatedPostPayloads: unknown[] = []
    const generationJobUpdatePayloads: unknown[] = []
    const chatsQuery = createMaybeSingleQuery({
      data: {
        id: CHAT_ID,
        user_id: USER_ID,
        business_profile_id: BUSINESS_PROFILE_ID,
        title: 'Morning drop',
        status: 'active',
      },
      error: null,
    })
    const businessProfileQuery = createMaybeSingleQuery({
      data: {
        id: BUSINESS_PROFILE_ID,
        user_id: USER_ID,
        name: 'Moonline Cafe',
        business_type: 'Cafe',
        brand_description: 'A warm specialty coffee shop.',
        tone_preferences: ['Warm and friendly'],
        style_preferences: [],
        brand_colors: ['#f3b56a'],
        is_default: true,
      },
      error: null,
    })
    const attachmentAssetsQuery = createListQuery({
      data: [
        {
          id: ATTACHMENT_ASSET_ID,
          user_id: USER_ID,
          chat_id: CHAT_ID,
          asset_kind: 'prompt_attachment',
          bucket_name: 'chat-assets',
          storage_path: `${USER_ID}/attachments/${ATTACHMENT_ASSET_ID}.png`,
          mime_type: 'image/png',
          file_size_bytes: 1024,
        },
      ],
      error: null,
    })
    const brandReferenceAssetsQuery = createListQuery({
      data: [],
      error: null,
    })
    const latestPostQuery = createMaybeSingleQuery({
      data: {
        id: GENERATED_POST_ID,
        user_id: USER_ID,
        chat_id: CHAT_ID,
        version_group_id: VERSION_GROUP_ID,
        version_number: 2,
        previous_post_id: PREVIOUS_POST_ID,
        caption_text: 'Fresh coffee, now pouring.',
        bucket_name: 'generated-posts',
        image_storage_path: `${USER_ID}/renders/${GENERATED_POST_ID}.png`,
        width: 1080,
        height: 1350,
        metadata: {},
        created_at: '2026-04-28T12:00:00.000Z',
      },
      error: null,
    })
    const chatMessagesTable = createSequentialInsertTable([
      {
        data: {
          id: USER_MESSAGE_ID,
          role: 'user',
          message_type: 'edit_request',
          content_text: 'Move the logo to the right.',
          metadata: {},
          created_at: '2026-04-28T12:10:00.000Z',
        },
        error: null,
      },
      {
        data: {
          id: ASSISTANT_MESSAGE_ID,
          role: 'assistant',
          message_type: 'generation_result',
          content_text: 'Updated the post draft.',
          metadata: {},
          created_at: '2026-04-28T12:11:00.000Z',
        },
        error: null,
      },
    ], chatMessagePayloads)
    const generationJobsTable = createSequentialInsertTable([
      {
        data: {
          id: GENERATION_JOB_ID,
          status: 'pending',
          queued_at: '2026-04-28T12:10:00.000Z',
          source_message_id: USER_MESSAGE_ID,
        },
        error: null,
      },
    ], [])
    const generatedPostsTable = createSequentialInsertTable([
      {
        data: {
          id: NEXT_GENERATED_POST_ID,
          user_id: USER_ID,
          chat_id: CHAT_ID,
          version_group_id: VERSION_GROUP_ID,
          version_number: 3,
          previous_post_id: GENERATED_POST_ID,
          caption_text: 'Fresh coffee, same mood, new look.',
          bucket_name: 'generated-posts',
          image_storage_path: `${USER_ID}/renders/${NEXT_GENERATED_POST_ID}.png`,
          width: 1080,
          height: 1350,
          metadata: {},
          created_at: '2026-04-28T12:11:00.000Z',
        },
        error: null,
      },
    ], generatedPostPayloads)
    const generationJobUpdates = createDoubleEqMutationTable(generationJobUpdatePayloads)
    const storageMock = createStorageMock()

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'chats') {
          return {
            select: vi.fn(() => chatsQuery),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  error: null,
                })),
              })),
            })),
          }
        }

        if (table === 'business_profiles') {
          return {
            select: vi.fn(() => businessProfileQuery),
          }
        }

        if (table === 'uploaded_assets') {
          const selectMock = vi.fn(() => {
            let isReferenceQuery = false

            const chain = {
              eq: vi.fn((field: string) => {
                if (field === 'business_profile_id') {
                  isReferenceQuery = true
                }

                return chain
              }),
              in: vi.fn(() => attachmentAssetsQuery.in('id', [ATTACHMENT_ASSET_ID])),
              order: vi.fn(() => ({
                limit: vi.fn(async () => {
                  if (isReferenceQuery) {
                    return brandReferenceAssetsQuery.limit(4)
                  }

                  throw new Error('Unexpected uploaded_assets order/limit query')
                }),
              })),
            }

            return chain
          })

          return {
            select: selectMock,
          }
        }

        if (table === 'generated_posts') {
          return {
            select: vi.fn(() => latestPostQuery),
            insert: generatedPostsTable.insert,
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  error: null,
                })),
              })),
            })),
          }
        }

        if (table === 'chat_messages') {
          return {
            insert: chatMessagesTable.insert,
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  error: null,
                })),
              })),
            })),
          }
        }

        if (table === 'generation_jobs') {
          return {
            insert: generationJobsTable.insert,
            update: generationJobUpdates.update,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: storageMock.storage,
    })
    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: USER_ID,
      },
    })
    getActiveSubscriptionWithPlanMock.mockResolvedValue({
      plan: {
        monthly_generation_limit: 30,
        monthly_edit_limit: 30,
      },
    })
    getOrCreateUsagePeriodMock.mockResolvedValue({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      period_start: '2026-04-01T00:00:00.000Z',
      period_end: '2026-05-01T00:00:00.000Z',
      generation_count: 4,
      edit_count: 1,
    })
    generatePostImageMock.mockResolvedValue({
      model: 'gpt-image-2',
      responseId: 'resp-image-2',
      imageBase64: btoa('edited-image'),
      revisedPrompt: 'Updated prompt',
      outputWidth: 1080,
      outputHeight: 1350,
      requestedSize: '1080x1350',
      usage: {},
    })
    generateCaptionMock.mockResolvedValue({
      responseId: 'resp-caption-2',
      caption: 'Fresh coffee, same mood, new look.',
      usage: {},
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        prompt: 'Move the logo to the right.',
        width: 1080,
        height: 1350,
        attachment_asset_ids: [ATTACHMENT_ASSET_ID],
      }),
    }))

    expect(response.status).toBe(200)
    expect(assertEditAllowedMock).toHaveBeenCalled()
    expect(assertGenerationAllowedMock).not.toHaveBeenCalled()
    expect(chatMessagePayloads[0]).toMatchObject({
      message_type: 'edit_request',
    })
    expect(generatePostImageMock).toHaveBeenCalledWith(expect.objectContaining({
      referenceImageUrls: [
        `https://signed.example/generated-posts/${USER_ID}/renders/${GENERATED_POST_ID}.png`,
        `https://signed.example/chat-assets/${USER_ID}/attachments/${ATTACHMENT_ASSET_ID}.png`,
      ],
    }))
    expect(generatedPostPayloads[0]).toMatchObject({
      previous_post_id: GENERATED_POST_ID,
      version_group_id: VERSION_GROUP_ID,
      version_number: 3,
      status: 'edited',
    })
    expect(recordUsageEventMock).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      eventType: 'edit',
      resourceId: NEXT_GENERATED_POST_ID,
    }))

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        generation_mode: 'edit',
        post: {
          id: NEXT_GENERATED_POST_ID,
        },
      },
    })
  })

  it('marks the job as failed and stores an assistant error message when image generation fails', async () => {
    const chatMessagePayloads: unknown[] = []
    const generationJobUpdatePayloads: unknown[] = []
    const chatsQuery = createMaybeSingleQuery({
      data: {
        id: CHAT_ID,
        user_id: USER_ID,
        business_profile_id: BUSINESS_PROFILE_ID,
        title: 'Morning drop',
        status: 'active',
      },
      error: null,
    })
    const businessProfileQuery = createMaybeSingleQuery({
      data: {
        id: BUSINESS_PROFILE_ID,
        user_id: USER_ID,
        name: 'Moonline Cafe',
        business_type: 'Cafe',
        brand_description: null,
        tone_preferences: [],
        style_preferences: [],
        brand_colors: [],
        is_default: true,
      },
      error: null,
    })
    const latestPostQuery = createMaybeSingleQuery({
      data: null,
      error: null,
    })
    const brandReferenceAssetsQuery = createListQuery({
      data: [],
      error: null,
    })
    const chatMessagesTable = createSequentialInsertTable([
      {
        data: {
          id: USER_MESSAGE_ID,
          role: 'user',
          message_type: 'generation_request',
          content_text: 'Create a launch post',
          metadata: {},
          created_at: '2026-04-28T12:00:00.000Z',
        },
        error: null,
      },
      {
        data: {
          id: ASSISTANT_MESSAGE_ID,
          role: 'assistant',
          message_type: 'error',
          content_text: 'Generation failed safely.',
          metadata: {},
          created_at: '2026-04-28T12:01:00.000Z',
        },
        error: null,
      },
    ], chatMessagePayloads)
    const generationJobsTable = createSequentialInsertTable([
      {
        data: {
          id: GENERATION_JOB_ID,
          status: 'pending',
          queued_at: '2026-04-28T12:00:00.000Z',
          source_message_id: USER_MESSAGE_ID,
        },
        error: null,
      },
    ], [])
    const generationJobUpdates = createDoubleEqMutationTable(generationJobUpdatePayloads)
    const storageMock = createStorageMock()

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'chats') {
          return {
            select: vi.fn(() => chatsQuery),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  error: null,
                })),
              })),
            })),
          }
        }

        if (table === 'business_profiles') {
          return {
            select: vi.fn(() => businessProfileQuery),
          }
        }

        if (table === 'uploaded_assets') {
          const selectMock = vi.fn(() => {
            const chain = {
              eq: vi.fn(() => chain),
              in: vi.fn(() => chain),
              order: vi.fn(() => ({
                limit: vi.fn(async () => brandReferenceAssetsQuery.limit(4)),
              })),
            }

            return chain
          })

          return {
            select: selectMock,
          }
        }

        if (table === 'generated_posts') {
          return {
            select: vi.fn(() => latestPostQuery),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  error: null,
                })),
              })),
            })),
          }
        }

        if (table === 'chat_messages') {
          return {
            insert: chatMessagesTable.insert,
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  error: null,
                })),
              })),
            })),
          }
        }

        if (table === 'generation_jobs') {
          return {
            insert: generationJobsTable.insert,
            update: generationJobUpdates.update,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: storageMock.storage,
    })
    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: USER_ID,
      },
    })
    getActiveSubscriptionWithPlanMock.mockResolvedValue({
      plan: {
        monthly_generation_limit: 30,
        monthly_edit_limit: 30,
      },
    })
    getOrCreateUsagePeriodMock.mockResolvedValue({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      period_start: '2026-04-01T00:00:00.000Z',
      period_end: '2026-05-01T00:00:00.000Z',
      generation_count: 4,
      edit_count: 1,
    })
    const handler = await loadHandler()
    const { AppError: HandlerAppError } = await import('../_shared/errors.ts')
    generatePostImageMock.mockRejectedValue(
      new HandlerAppError('OPENAI_REQUEST_FAILED', 'OpenAI request failed.', 502),
    )
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        prompt: 'Create a launch post',
        width: 1080,
        height: 1350,
      }),
    }))

    expect(response.status).toBe(502)
    expect(generationJobUpdatePayloads[0]).toMatchObject({
      status: 'processing',
    })
    expect(generationJobUpdatePayloads[1]).toMatchObject({
      status: 'failed',
      error_message: 'OpenAI request failed.',
    })
    expect(chatMessagePayloads[1]).toMatchObject({
      role: 'assistant',
      message_type: 'error',
      content_text: 'Generation failed safely.',
    })

    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'OPENAI_REQUEST_FAILED',
      },
    })
  })
})
