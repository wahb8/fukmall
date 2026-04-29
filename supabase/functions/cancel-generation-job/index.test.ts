import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireAuthenticatedUserMock = vi.fn()
const createAdminClientMock = vi.fn()

const USER_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '33333333-3333-4333-8333-333333333333'

vi.mock('../_shared/auth.ts', () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

vi.mock('../_shared/supabase.ts', () => ({
  createAdminClient: createAdminClientMock,
}))

function createLookupQuery(result: { data: unknown, error: unknown }) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  }

  return chain
}

function createCancelUpdateQuery(result: { data: unknown, error: unknown }) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    select: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
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

describe('cancel-generation-job edge function', () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockReset()
    createAdminClientMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks an owned processing generation job as canceled', async () => {
    const lookupQuery = createLookupQuery({
      data: {
        id: JOB_ID,
        user_id: USER_ID,
        status: 'processing',
      },
      error: null,
    })
    const updateQuery = createCancelUpdateQuery({
      data: {
        id: JOB_ID,
        user_id: USER_ID,
        status: 'canceled',
        error_message: 'Generation stopped by user.',
      },
      error: null,
    })
    const updateMock = vi.fn(() => updateQuery)

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table !== 'generation_jobs') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select: vi.fn(() => lookupQuery),
          update: updateMock,
        }
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

    expect(response.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'canceled',
      error_message: 'Generation stopped by user.',
    }))
    expect(updateQuery.in).toHaveBeenCalledWith('status', ['pending', 'processing'])
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        canceled: true,
        job: {
          id: JOB_ID,
          status: 'canceled',
        },
      },
    })
  })

  it('returns the existing job without updating when already terminal', async () => {
    const lookupQuery = createLookupQuery({
      data: {
        id: JOB_ID,
        user_id: USER_ID,
        status: 'completed',
      },
      error: null,
    })
    const updateMock = vi.fn()

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table !== 'generation_jobs') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select: vi.fn(() => lookupQuery),
          update: updateMock,
        }
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

    expect(response.status).toBe(200)
    expect(updateMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        canceled: false,
        job: {
          id: JOB_ID,
          status: 'completed',
        },
      },
    })
  })

  it('returns the current job if it becomes terminal before the cancel update applies', async () => {
    const initialLookupQuery = createLookupQuery({
      data: {
        id: JOB_ID,
        user_id: USER_ID,
        status: 'processing',
      },
      error: null,
    })
    const currentLookupQuery = createLookupQuery({
      data: {
        id: JOB_ID,
        user_id: USER_ID,
        status: 'completed',
      },
      error: null,
    })
    const selectMock = vi.fn()
      .mockReturnValueOnce(initialLookupQuery)
      .mockReturnValueOnce(currentLookupQuery)
    const updateQuery = createCancelUpdateQuery({
      data: null,
      error: null,
    })

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table !== 'generation_jobs') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select: selectMock,
          update: vi.fn(() => updateQuery),
        }
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

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        canceled: false,
        job: {
          id: JOB_ID,
          status: 'completed',
        },
      },
    })
  })

  it('returns 404 when the job does not belong to the user', async () => {
    const lookupQuery = createLookupQuery({
      data: null,
      error: null,
    })

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table !== 'generation_jobs') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select: vi.fn(() => lookupQuery),
        }
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
