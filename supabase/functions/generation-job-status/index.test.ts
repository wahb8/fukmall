import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireAuthenticatedUserMock = vi.fn()
const createAdminClientMock = vi.fn()

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CHAT_ID = '22222222-2222-4222-8222-222222222222'
const JOB_ID = '33333333-3333-4333-8333-333333333333'
const ASSISTANT_MESSAGE_ID = '44444444-4444-4444-8444-444444444444'
const GENERATED_POST_ID = '55555555-5555-4555-8555-555555555555'

vi.mock('../_shared/auth.ts', () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

vi.mock('../_shared/supabase.ts', () => ({
  createAdminClient: createAdminClientMock,
}))

function createMaybeSingleQuery(result: { data: unknown, error: unknown }) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  }

  return chain
}

function createMessageListQuery(result: { data: unknown, error: unknown }) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => result),
  }

  return chain
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

describe('generation-job-status edge function', () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockReset()
    createAdminClientMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an owned generation job and matching assistant message', async () => {
    const jobQuery = createMaybeSingleQuery({
      data: {
        id: JOB_ID,
        user_id: USER_ID,
        chat_id: CHAT_ID,
        status: 'completed',
        output_post_id: GENERATED_POST_ID,
      },
      error: null,
    })
    const generatedPostQuery = createMaybeSingleQuery({
      data: {
        id: GENERATED_POST_ID,
        user_id: USER_ID,
        chat_id: CHAT_ID,
        source_message_id: '66666666-6666-4666-8666-666666666666',
        status: 'draft',
        prompt_text: 'Create a post.',
        caption_text: 'Fresh coffee is here.',
        bucket_name: 'generated-posts',
        image_storage_path: `${USER_ID}/renders/${GENERATED_POST_ID}.png`,
        width: 1080,
        height: 1350,
        metadata: {},
        created_at: '2026-04-29T12:00:00.000Z',
        updated_at: '2026-04-29T12:00:00.000Z',
      },
      error: null,
    })
    const messagesQuery = createMessageListQuery({
      data: [
        {
          id: ASSISTANT_MESSAGE_ID,
          role: 'assistant',
          message_type: 'generation_result',
          content_text: 'Generated a new post draft.',
          metadata: {
            generation_job_id: JOB_ID,
          },
          created_at: '2026-04-29T12:01:00.000Z',
        },
      ],
      error: null,
    })

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'generation_jobs') {
          return {
            select: vi.fn(() => jobQuery),
          }
        }

        if (table === 'generated_posts') {
          return {
            select: vi.fn(() => generatedPostQuery),
          }
        }

        if (table === 'chat_messages') {
          return {
            select: vi.fn(() => messagesQuery),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(async () => ({
            data: {
              signedUrl: 'https://signed.example/generated-post.png',
            },
            error: null,
          })),
        })),
      },
    })
    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: USER_ID,
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
        job_id: JOB_ID,
      }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        job: {
          id: JOB_ID,
          status: 'completed',
        },
        assistant_message: {
          id: ASSISTANT_MESSAGE_ID,
        },
        generated_post: {
          id: GENERATED_POST_ID,
          preview_url: 'https://signed.example/generated-post.png',
          previewUrl: 'https://signed.example/generated-post.png',
        },
      },
    })
  })

  it('returns 404 when the job does not belong to the user', async () => {
    const jobQuery = createMaybeSingleQuery({
      data: null,
      error: null,
    })

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'generation_jobs') {
          return {
            select: vi.fn(() => jobQuery),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })
    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: USER_ID,
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
        job_id: JOB_ID,
      }),
    }))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'NOT_FOUND',
      },
    })
  })
})
