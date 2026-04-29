import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  requireAuthenticatedUserMock,
  createAdminClientMock,
  getActiveSubscriptionWithPlanMock,
  getOrCreateUsagePeriodMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  getActiveSubscriptionWithPlanMock: vi.fn(),
  getOrCreateUsagePeriodMock: vi.fn(),
}))

vi.mock('../_shared/auth.ts', () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

vi.mock('../_shared/supabase.ts', () => ({
  createAdminClient: createAdminClientMock,
}))

vi.mock('../_shared/plans.ts', () => ({
  getActiveSubscriptionWithPlan: getActiveSubscriptionWithPlanMock,
}))

vi.mock('../_shared/usage.ts', async () => {
  const actual = await vi.importActual('../_shared/usage.ts')
  return {
    ...actual,
    getOrCreateUsagePeriod: getOrCreateUsagePeriodMock,
  }
})

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

function createSubscription() {
  return {
    id: null,
    user_id: 'user-1',
    plan_id: 'plan-free',
    status: 'active',
    current_period_start: null,
    current_period_end: null,
    renewal_date: null,
    canceled_at: null,
    expired_at: null,
    cancel_at_period_end: false,
    metadata: {},
    plan: {
      id: 'plan-free',
      code: 'free',
      name: 'Free',
      monthly_generation_limit: 5,
      monthly_edit_limit: 10,
      monthly_storage_limit_bytes: 52428800,
      monthly_asset_upload_limit: 10,
      feature_flags: {},
    },
  }
}

describe('prepare-upload edge function', () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockReset()
    createAdminClientMock.mockReset()
    getActiveSubscriptionWithPlanMock.mockReset()
    getOrCreateUsagePeriodMock.mockReset()
  })

  it('returns a signed upload target for a valid logo upload', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    })
    getActiveSubscriptionWithPlanMock.mockResolvedValue(createSubscription())
    getOrCreateUsagePeriodMock.mockResolvedValue({
      id: 'usage-1',
      period_start: '2026-04-01T00:00:00.000Z',
      period_end: '2026-05-01T00:00:00.000Z',
      asset_upload_count: 1,
      storage_bytes_used: 1024,
    })
    createAdminClientMock.mockReturnValue({
      storage: {
        from: vi.fn(() => ({
          createSignedUploadUrl: vi.fn(async () => ({
            data: {
              token: 'upload-token',
            },
            error: null,
          })),
        })),
      },
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({
        asset_kind: 'logo',
        file_name: 'Brand Kit.png',
        mime_type: 'image/png',
        file_size_bytes: 2048,
      }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        upload: {
          asset_kind: 'logo',
          bucket_name: 'brand-assets',
          token: 'upload-token',
        },
      },
    })
  })

  it('rejects unsupported upload types', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({
        asset_kind: 'logo',
        file_name: 'Brand Kit.pdf',
        mime_type: 'application/pdf',
        file_size_bytes: 2048,
      }),
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
      },
    })
  })

  it('accepts png files reported with a generic browser MIME type', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    })
    getActiveSubscriptionWithPlanMock.mockResolvedValue(createSubscription())
    getOrCreateUsagePeriodMock.mockResolvedValue({
      id: 'usage-1',
      period_start: '2026-04-01T00:00:00.000Z',
      period_end: '2026-05-01T00:00:00.000Z',
      asset_upload_count: 1,
      storage_bytes_used: 1024,
    })
    createAdminClientMock.mockReturnValue({
      storage: {
        from: vi.fn(() => ({
          createSignedUploadUrl: vi.fn(async () => ({
            data: {
              token: 'upload-token',
            },
            error: null,
          })),
        })),
      },
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({
        asset_kind: 'logo',
        file_name: 'Brand Kit.PNG',
        mime_type: 'application/octet-stream',
        file_size_bytes: 2048,
      }),
    }))

    expect(response.status).toBe(200)
  })
})
