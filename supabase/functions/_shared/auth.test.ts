import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createRequestClientMock = vi.fn()

vi.mock('./supabase.ts', () => ({
  createRequestClient: createRequestClientMock,
}))

describe('requireAuthenticatedUser', () => {
  beforeEach(() => {
    vi.resetModules()
    createRequestClientMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects requests without a bearer token', async () => {
    const { requireAuthenticatedUser } = await import('./auth.ts')

    await expect(
      requireAuthenticatedUser(
        new Request('https://example.com', {
          headers: {},
        }),
      ),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    })
  })

  it('rejects invalid or expired sessions', async () => {
    createRequestClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: null,
          },
          error: { message: 'expired' },
        })),
      },
    })
    const { requireAuthenticatedUser } = await import('./auth.ts')

    await expect(
      requireAuthenticatedUser(
        new Request('https://example.com', {
          headers: {
            Authorization: 'Bearer token',
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    })
  })

  it('returns the authenticated user and request client', async () => {
    const requestClient = {
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
    }
    createRequestClientMock.mockReturnValue(requestClient)
    const { requireAuthenticatedUser } = await import('./auth.ts')

    await expect(
      requireAuthenticatedUser(
        new Request('https://example.com', {
          headers: {
            Authorization: 'Bearer token',
          },
        }),
      ),
    ).resolves.toEqual({
      user: {
        id: 'user-1',
      },
      client: requestClient,
    })
  })
})
