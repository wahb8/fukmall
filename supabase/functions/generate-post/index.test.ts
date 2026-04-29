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
const generateChatTitleMock = vi.fn()
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
const BRAND_LOGO_ASSET_ID = '5a5a5a5a-5a5a-45a5-85a5-5a5a5a5a5a5a'
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
  generateChatTitle: generateChatTitleMock,
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
  let latestPayload: Record<string, unknown> | null = null
  const result = { error: null }
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    select: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({
      data: {
        id: GENERATION_JOB_ID,
        status: latestPayload?.status ?? 'processing',
      },
      error: null,
    })),
    single: vi.fn(async () => ({
      data: {
        id: GENERATION_JOB_ID,
        status: latestPayload?.status ?? 'processing',
      },
      error: null,
    })),
    then: (onFulfilled: (value: typeof result) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }

  return {
    update: vi.fn((payload) => {
      latestPayload = payload
      payloadRecorder.push(payload)

      return chain
    }),
    delete: vi.fn(() => chain),
    firstEq: chain.eq,
    secondEq: chain.eq,
  }
}

function createCancelAtCompletionMutationTable(payloadRecorder: unknown[]) {
  let latestPayload: Record<string, unknown> | null = null
  const result = { error: null }
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    select: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => {
      if (latestPayload?.status === 'completed') {
        return {
          data: null,
          error: null,
        }
      }

      return {
        data: {
          id: GENERATION_JOB_ID,
          status: latestPayload?.status ?? 'processing',
        },
        error: null,
      }
    }),
    then: (onFulfilled: (value: typeof result) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }

  return {
    update: vi.fn((payload) => {
      latestPayload = payload
      payloadRecorder.push(payload)

      return chain
    }),
  }
}

function createDeferred<T = unknown>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
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
    generateChatTitleMock.mockReset()
    buildImageGenerationInstructionsMock.mockClear()
    buildImageGenerationUserPromptMock.mockClear()
    buildCaptionInstructionsMock.mockClear()
    buildCaptionUserPromptMock.mockClear()
    buildAssistantSummaryTextMock.mockClear()
    buildSafeGenerationErrorMessageMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as typeof globalThis & { EdgeRuntime?: unknown }).EdgeRuntime
  })

  it('creates an initial generated post, assistant response, and usage records', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(GENERATED_POST_ID)
    const titleDeferred = createDeferred<{
      responseId: string
      title: string
      usage: Record<string, unknown>
    }>()
    const backgroundTasks: Promise<unknown>[] = []
    ;(globalThis as typeof globalThis & {
      EdgeRuntime?: {
        waitUntil: (task: Promise<unknown>) => void
      }
    }).EdgeRuntime = {
      waitUntil: vi.fn((task) => {
        backgroundTasks.push(task)
      }),
    }
    const chatsUpdatePayloads: unknown[] = []
    const generationJobUpdatePayloads: unknown[] = []
    const chatMessagePayloads: unknown[] = []
    const generatedPostPayloads: unknown[] = []
    const chatsQuery = createMaybeSingleQuery({
      data: {
        id: CHAT_ID,
        user_id: USER_ID,
        business_profile_id: null,
        title: 'Untitled',
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
        logo_asset_id: BRAND_LOGO_ASSET_ID,
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
    const brandLogoAssetQuery = createMaybeSingleQuery({
      data: {
        id: BRAND_LOGO_ASSET_ID,
        user_id: USER_ID,
        business_profile_id: BUSINESS_PROFILE_ID,
        asset_kind: 'logo',
        bucket_name: 'brand-assets',
        storage_path: `${USER_ID}/logos/${BRAND_LOGO_ASSET_ID}.png`,
        mime_type: 'image/png',
        file_size_bytes: 1536,
      },
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

                if (field === 'asset_kind' && value === 'logo') {
                  return chain
                }

                if (field === 'id' && value === BRAND_LOGO_ASSET_ID) {
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
              maybeSingle: vi.fn(async () => brandLogoAssetQuery.maybeSingle()),
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
            select: vi.fn(() => createMaybeSingleQuery({
              data: {
                id: GENERATION_JOB_ID,
                status: 'processing',
              },
              error: null,
            })),
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
    generateChatTitleMock.mockReturnValue(titleDeferred.promise)

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

    expect(response.status).toBe(202)
    expect((globalThis as typeof globalThis & {
      EdgeRuntime?: {
        waitUntil: ReturnType<typeof vi.fn>
      }
    }).EdgeRuntime?.waitUntil).toHaveBeenCalledTimes(2)
    await backgroundTasks[1]
    expect(assertGenerationAllowedMock).toHaveBeenCalled()
    expect(assertEditAllowedMock).not.toHaveBeenCalled()
    expect(generatePostImageMock).toHaveBeenCalledWith(expect.objectContaining({
      requestedWidth: 1080,
      requestedHeight: 1350,
      referenceImageUrls: [
        {
          url: `https://signed.example/brand-assets/${USER_ID}/logos/${BRAND_LOGO_ASSET_ID}.png`,
          fileName: 'logo',
        },
        {
          url: `https://signed.example/brand-assets/${USER_ID}/references/${BRAND_REFERENCE_ASSET_ID}.png`,
          fileName: 'reference-1',
        },
        {
          url: `https://signed.example/chat-assets/${USER_ID}/attachments/${ATTACHMENT_ASSET_ID}.png`,
          fileName: 'attachment-1',
        },
      ],
    }))
    expect(buildImageGenerationUserPromptMock).toHaveBeenCalledWith(expect.objectContaining({
      hasBrandLogo: true,
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
        brand_logo_asset_id: BRAND_LOGO_ASSET_ID,
      }),
    })
    expect(chatsUpdatePayloads).toEqual([
      { business_profile_id: BUSINESS_PROFILE_ID },
    ])
    expect(generateChatTitleMock).toHaveBeenCalledWith({
      prompt: 'Create a launch post',
    })
    expect(generationJobUpdatePayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'canceled',
        error_message: 'Generation superseded by a newer request.',
      }),
      expect.objectContaining({
        status: 'processing',
      }),
      expect.objectContaining({
        status: 'completed',
        model: 'gpt-image-2',
        output_post_id: GENERATED_POST_ID,
      }),
    ]))
    expect(generationJobUpdatePayloads.at(-1)).toMatchObject({
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
        job: {
          id: GENERATION_JOB_ID,
          status: 'pending',
        },
      },
    })

    titleDeferred.resolve({
      responseId: 'resp-title-1',
      title: 'Coffee Launch',
      usage: {
        output_tokens: 4,
      },
    })
    await backgroundTasks[0]
    expect(chatsUpdatePayloads).toEqual([
      { business_profile_id: BUSINESS_PROFILE_ID },
      { title: 'Coffee Launch' },
    ])
  })

  it('keeps image generation working when automatic title generation fails', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(GENERATED_POST_ID)
    const generationJobUpdatePayloads: unknown[] = []
    const chatMessagePayloads: unknown[] = []
    const generatedPostPayloads: unknown[] = []
    const chatsUpdatePayloads: unknown[] = []
    const chatsQuery = createMaybeSingleQuery({
      data: {
        id: CHAT_ID,
        user_id: USER_ID,
        business_profile_id: BUSINESS_PROFILE_ID,
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
        brand_description: null,
        tone_preferences: [],
        style_preferences: [],
        brand_colors: [],
        logo_asset_id: null,
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
          content_text: 'Create a coffee promo',
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
    const generationJobUpdates = createDoubleEqMutationTable(generationJobUpdatePayloads)
    const chatsTable = {
      select: vi.fn(() => chatsQuery),
      ...createDoubleEqMutationTable(chatsUpdatePayloads),
    }
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
          const uploadedAssetsQuery = {
            eq: vi.fn(() => uploadedAssetsQuery),
            order: vi.fn(() => ({
              limit: vi.fn(async () => brandReferenceAssetsQuery.limit(4)),
            })),
          }

          return {
            select: vi.fn(() => uploadedAssetsQuery),
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
            select: vi.fn(() => createMaybeSingleQuery({
              data: {
                id: GENERATION_JOB_ID,
                status: 'processing',
              },
              error: null,
            })),
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
    generateChatTitleMock.mockRejectedValue(new Error('Title generation failed'))
    generatePostImageMock.mockResolvedValue({
      model: 'gpt-image-2',
      responseId: 'resp-image-1',
      imageBase64: btoa('generated-image'),
      revisedPrompt: null,
      outputWidth: 1080,
      outputHeight: 1350,
      requestedSize: '1080x1350',
      usage: {},
    })
    generateCaptionMock.mockResolvedValue({
      responseId: 'resp-caption-1',
      caption: 'Fresh coffee, now pouring.',
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
        prompt: 'Create a coffee promo',
        width: 1080,
        height: 1350,
        wait_for_completion: true,
      }),
    }))

    expect(response.status).toBe(200)
    expect(generateChatTitleMock).toHaveBeenCalledWith({
      prompt: 'Create a coffee promo',
    })
    expect(generatePostImageMock).toHaveBeenCalled()
    expect(generatedPostPayloads).toHaveLength(1)
    expect(chatsUpdatePayloads).toEqual([])
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
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
            select: vi.fn(() => createMaybeSingleQuery({
              data: {
                id: GENERATION_JOB_ID,
                status: 'processing',
              },
              error: null,
            })),
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
        wait_for_completion: true,
      }),
    }))

    expect(response.status).toBe(200)
    expect(assertEditAllowedMock).toHaveBeenCalled()
    expect(assertGenerationAllowedMock).not.toHaveBeenCalled()
    expect(generateChatTitleMock).not.toHaveBeenCalled()
    expect(chatMessagePayloads[0]).toMatchObject({
      message_type: 'edit_request',
    })
    expect(generatePostImageMock).toHaveBeenCalledWith(expect.objectContaining({
      referenceImageUrls: [
        {
          url: `https://signed.example/generated-posts/${USER_ID}/renders/${GENERATED_POST_ID}.png`,
          fileName: 'current-post',
        },
        {
          url: `https://signed.example/chat-assets/${USER_ID}/attachments/${ATTACHMENT_ASSET_ID}.png`,
          fileName: 'attachment-1',
        },
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
            select: vi.fn(() => createMaybeSingleQuery({
              data: {
                id: GENERATION_JOB_ID,
                status: 'processing',
              },
              error: null,
            })),
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
        wait_for_completion: true,
      }),
    }))

    expect(response.status).toBe(502)
    expect(generationJobUpdatePayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'canceled',
        error_message: 'Generation superseded by a newer request.',
      }),
      expect.objectContaining({
        status: 'processing',
      }),
      expect.objectContaining({
        status: 'failed',
        error_message: 'OpenAI request failed.',
      }),
    ]))
    expect(generationJobUpdatePayloads.at(-1)).toMatchObject({
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

  it('rolls back generated artifacts when the job is canceled before completion can be persisted', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(GENERATED_POST_ID)
    const chatMessagePayloads: unknown[] = []
    const generatedPostPayloads: unknown[] = []
    const generationJobUpdatePayloads: unknown[] = []
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
        tone_preferences: [],
        style_preferences: [],
        brand_colors: ['#f3b56a'],
        logo_asset_id: null,
        is_default: true,
      },
      error: null,
    })
    const brandReferenceAssetsQuery = createListQuery({
      data: [],
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
    const chatMessageDeleteMock = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({
          error: null,
        })),
      })),
    }))
    const generatedPostDeleteMock = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({
          error: null,
        })),
      })),
    }))
    const generationJobUpdates = createCancelAtCompletionMutationTable(generationJobUpdatePayloads)
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
            insert: generatedPostsTable.insert,
            delete: generatedPostDeleteMock,
          }
        }

        if (table === 'chat_messages') {
          return {
            insert: chatMessagesTable.insert,
            delete: chatMessageDeleteMock,
          }
        }

        if (table === 'generation_jobs') {
          return {
            insert: generationJobsTable.insert,
            select: vi.fn(() => createMaybeSingleQuery({
              data: {
                id: GENERATION_JOB_ID,
                status: 'processing',
              },
              error: null,
            })),
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
      usage: {},
    })
    generateCaptionMock.mockResolvedValue({
      responseId: 'resp-caption-1',
      caption: 'Fresh coffee, now pouring.',
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
        prompt: 'Create a launch post',
        width: 1080,
        height: 1350,
        wait_for_completion: true,
      }),
    }))

    expect(response.status).toBe(200)
    expect(generationJobUpdatePayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'processing',
      }),
      expect.objectContaining({
        status: 'completed',
        output_post_id: GENERATED_POST_ID,
      }),
    ]))
    expect(generatedPostPayloads).toHaveLength(1)
    expect(chatMessageDeleteMock).toHaveBeenCalled()
    expect(generatedPostDeleteMock).toHaveBeenCalled()
    expect(storageMock.removeCalls).toEqual([
      {
        bucketName: 'generated-posts',
        paths: [`${USER_ID}/renders/${GENERATED_POST_ID}.png`],
      },
    ])
    expect(recordUsageEventMock).not.toHaveBeenCalled()

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        job: {
          id: GENERATION_JOB_ID,
          status: 'canceled',
        },
      },
    })
  })
})
