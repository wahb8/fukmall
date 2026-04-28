import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireAuthenticatedUserMock = vi.fn()
const createAdminClientMock = vi.fn()
const getActiveSubscriptionWithPlanMock = vi.fn()
const getOrCreateUsagePeriodMock = vi.fn()
const assertGenerationAllowedMock = vi.fn()

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
}))

function createMaybeSingleQuery(result) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  }

  return chain
}

function createListQuery(result) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(async () => result),
  }

  return chain
}

function createInsertTable(singleResult, payloadRecorder) {
  return {
    insert: vi.fn((payload) => {
      payloadRecorder.push(payload)

      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => singleResult),
        })),
      }
    }),
  }
}

function createDeleteTable() {
  const secondEq = vi.fn(async () => ({
    error: null,
  }))
  const firstEq = vi.fn(() => ({
    eq: secondEq,
  }))

  return {
    delete: vi.fn(() => ({
      eq: firstEq,
    })),
    firstEq,
    secondEq,
  }
}

async function loadHandler() {
  vi.resetModules()

  let capturedHandler = null
  globalThis.Deno = {
    serve: vi.fn((handler) => {
      capturedHandler = handler
    }),
  }

  await import('./index.ts')

  return capturedHandler
}

describe('llm-generate-post edge function', () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockReset()
    createAdminClientMock.mockReset()
    getActiveSubscriptionWithPlanMock.mockReset()
    getOrCreateUsagePeriodMock.mockReset()
    assertGenerationAllowedMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 405 for unsupported methods', async () => {
    const handler = await loadHandler()

    const response = await handler(new Request('https://example.com', {
      method: 'GET',
    }))

    expect(response.status).toBe(405)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
      },
    })
  })

  it('creates a generation job with normalized attachment ids', async () => {
    const attachmentIds = [
      '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
      '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
      'a34b57b8-89f7-4ca9-a0a0-7da78f1dcb93',
    ]
    const normalizedAttachmentIds = [
      '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
      'a34b57b8-89f7-4ca9-a0a0-7da78f1dcb93',
    ]
    const chatMessagesPayloads = []
    const generationJobPayloads = []
    const chatsQuery = createMaybeSingleQuery({
      data: {
        id: '37a9f95e-f2fa-42fe-9690-604fce8198d3',
        user_id: 'f0f2ed04-2df6-48e8-b249-c1d3f5812fe7',
        business_profile_id: 'd2cb5d56-a5db-4a1b-b51b-23f6aa709639',
        status: 'active',
      },
      error: null,
    })
    const businessProfilesQuery = createMaybeSingleQuery({
      data: {
        id: 'd2cb5d56-a5db-4a1b-b51b-23f6aa709639',
      },
      error: null,
    })
    const uploadedAssetsQuery = createListQuery({
      data: normalizedAttachmentIds.map((id) => ({ id })),
      error: null,
    })
    const chatMessagesTable = createInsertTable({
      data: {
        id: 'c2b2ea93-a51d-481e-a1f4-534e343dc116',
        created_at: '2026-04-28T08:00:00.000Z',
      },
      error: null,
    }, chatMessagesPayloads)
    const generationJobsTable = createInsertTable({
      data: {
        id: '9b2f9a70-cfbd-4b39-8509-2ad9d60b9978',
        status: 'pending',
        queued_at: '2026-04-28T08:00:00.000Z',
        source_message_id: 'c2b2ea93-a51d-481e-a1f4-534e343dc116',
      },
      error: null,
    }, generationJobPayloads)

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'chats') {
          return {
            select: vi.fn(() => chatsQuery),
          }
        }

        if (table === 'business_profiles') {
          return {
            select: vi.fn(() => businessProfilesQuery),
          }
        }

        if (table === 'uploaded_assets') {
          return {
            select: vi.fn(() => uploadedAssetsQuery),
          }
        }

        if (table === 'chat_messages') {
          return chatMessagesTable
        }

        if (table === 'generation_jobs') {
          return generationJobsTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })
    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: 'f0f2ed04-2df6-48e8-b249-c1d3f5812fe7',
      },
    })
    getActiveSubscriptionWithPlanMock.mockResolvedValue({
      plan: {
        monthly_generation_limit: 30,
      },
    })
    getOrCreateUsagePeriodMock.mockResolvedValue({
      period_start: '2026-04-01T00:00:00.000Z',
      period_end: '2026-05-01T00:00:00.000Z',
      generation_count: 4,
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: '37a9f95e-f2fa-42fe-9690-604fce8198d3',
        business_profile_id: 'd2cb5d56-a5db-4a1b-b51b-23f6aa709639',
        prompt: 'Create a launch post',
        width: 1080,
        height: 1350,
        attachment_asset_ids: attachmentIds,
      }),
    }))

    expect(assertGenerationAllowedMock).toHaveBeenCalled()
    expect(response.status).toBe(202)
    expect(chatMessagesPayloads[0]).toMatchObject({
      role: 'user',
      message_type: 'generation_request',
      content_text: 'Create a launch post',
      metadata: {
        width: 1080,
        height: 1350,
        attachment_asset_ids: normalizedAttachmentIds,
        business_profile_id: 'd2cb5d56-a5db-4a1b-b51b-23f6aa709639',
      },
    })
    expect(generationJobPayloads[0]).toMatchObject({
      status: 'pending',
      provider: 'openai',
      request_payload: {
        attachment_asset_ids: normalizedAttachmentIds,
        business_profile_id: 'd2cb5d56-a5db-4a1b-b51b-23f6aa709639',
      },
    })
    expect(uploadedAssetsQuery.in).toHaveBeenCalledWith('id', normalizedAttachmentIds)

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        usage: {
          generation_limit: 30,
          generation_count: 4,
        },
      },
    })
  })

  it('rolls back the request message when job creation fails', async () => {
    const chatMessagesPayloads = []
    const deleteTable = createDeleteTable()
    const chatsQuery = createMaybeSingleQuery({
      data: {
        id: '37a9f95e-f2fa-42fe-9690-604fce8198d3',
        user_id: 'f0f2ed04-2df6-48e8-b249-c1d3f5812fe7',
        business_profile_id: null,
        status: 'active',
      },
      error: null,
    })
    const chatMessagesTable = {
      ...createInsertTable({
        data: {
          id: 'c2b2ea93-a51d-481e-a1f4-534e343dc116',
          created_at: '2026-04-28T08:00:00.000Z',
        },
        error: null,
      }, chatMessagesPayloads),
      delete: deleteTable.delete,
    }
    const generationJobsTable = createInsertTable({
      data: null,
      error: { message: 'insert failed' },
    }, [])

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'chats') {
          return {
            select: vi.fn(() => chatsQuery),
          }
        }

        if (table === 'chat_messages') {
          return chatMessagesTable
        }

        if (table === 'generation_jobs') {
          return generationJobsTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })
    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: 'f0f2ed04-2df6-48e8-b249-c1d3f5812fe7',
      },
    })
    getActiveSubscriptionWithPlanMock.mockResolvedValue({
      plan: {
        monthly_generation_limit: 30,
      },
    })
    getOrCreateUsagePeriodMock.mockResolvedValue({
      period_start: '2026-04-01T00:00:00.000Z',
      period_end: '2026-05-01T00:00:00.000Z',
      generation_count: 4,
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: '37a9f95e-f2fa-42fe-9690-604fce8198d3',
        prompt: 'Create a launch post',
        width: 1080,
        height: 1080,
      }),
    }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'JOB_CREATE_FAILED',
      },
    })
    expect(deleteTable.delete).toHaveBeenCalled()
    expect(deleteTable.firstEq).toHaveBeenCalledWith('id', 'c2b2ea93-a51d-481e-a1f4-534e343dc116')
    expect(deleteTable.secondEq).toHaveBeenCalledWith('user_id', 'f0f2ed04-2df6-48e8-b249-c1d3f5812fe7')
  })
})
