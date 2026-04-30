import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  requireAuthenticatedUserMock,
  createAdminClientMock,
  getActiveSubscriptionWithPlanMock,
  getOrCreateUsagePeriodMock,
  recordUsageEventMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  getActiveSubscriptionWithPlanMock: vi.fn(),
  getOrCreateUsagePeriodMock: vi.fn(),
  recordUsageEventMock: vi.fn(),
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
    recordUsageEvent: recordUsageEventMock,
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

describe('finalize-upload edge function', () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockReset()
    createAdminClientMock.mockReset()
    getActiveSubscriptionWithPlanMock.mockReset()
    getOrCreateUsagePeriodMock.mockReset()
    recordUsageEventMock.mockReset()
  })

  it('finalizes a new uploaded asset and records usage', async () => {
    const uploadedAssetPayloads = []
    const uploadedAssetsTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
              })),
            })),
          })),
        })),
      })),
      insert: vi.fn((payload) => {
        uploadedAssetPayloads.push(payload)
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'asset-1',
                ...payload,
              },
              error: null,
            })),
          })),
        }
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({
            error: null,
          })),
        })),
      })),
    }

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
    recordUsageEventMock.mockResolvedValue({
      id: 'usage-event-1',
    })
    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'uploaded_assets') {
          return uploadedAssetsTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: {
        from: vi.fn(() => ({
          info: vi.fn(async () => ({
            data: {
              size: 2048,
              contentType: 'image/png',
              metadata: {
                mimetype: 'application/octet-stream',
              },
            },
            error: null,
          })),
          remove: vi.fn(async () => ({
            data: [],
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
        bucket_name: 'brand-assets',
        storage_path: 'user-1/logos/asset-1-brand-kit.png',
        original_file_name: 'Brand Kit.png',
        width: 1080,
        height: 1080,
      }),
    }))

    expect(uploadedAssetPayloads[0]).toMatchObject({
      user_id: 'user-1',
      asset_kind: 'logo',
      bucket_name: 'brand-assets',
      storage_path: 'user-1/logos/asset-1-brand-kit.png',
      mime_type: 'image/png',
      file_size_bytes: 2048,
      width: 1080,
      height: 1080,
    })
    expect(recordUsageEventMock).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      userId: 'user-1',
      usagePeriodId: 'usage-1',
      eventType: 'storage_upload',
      resourceType: 'uploaded_asset',
      resourceId: 'asset-1',
      storageBytesDelta: 2048,
    }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        asset: {
          id: 'asset-1',
        },
      },
    })
  })

  it('finalizes png uploads whose metadata MIME is generic when the filename is supported', async () => {
    const uploadedAssetPayloads = []
    const uploadedAssetsTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
              })),
            })),
          })),
        })),
      })),
      insert: vi.fn((payload) => {
        uploadedAssetPayloads.push(payload)
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'asset-1',
                ...payload,
              },
              error: null,
            })),
          })),
        }
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({
            error: null,
          })),
        })),
      })),
    }

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
    recordUsageEventMock.mockResolvedValue({
      id: 'usage-event-1',
    })
    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'uploaded_assets') {
          return uploadedAssetsTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: {
        from: vi.fn(() => ({
          info: vi.fn(async () => ({
            data: {
              metadata: {
                mimetype: 'application/octet-stream',
                size: 2048,
              },
            },
            error: null,
          })),
          remove: vi.fn(async () => ({
            data: [],
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
        bucket_name: 'brand-assets',
        storage_path: 'user-1/logos/asset-1-brand-kit.png',
        original_file_name: 'Brand Kit.PNG',
        width: 1080,
        height: 1080,
      }),
    }))

    expect(response.status).toBe(200)
    expect(uploadedAssetPayloads[0]).toMatchObject({
      mime_type: 'image/png',
    })
  })

  it('reads Supabase Storage info size and content type from top-level fields', async () => {
    const uploadedAssetPayloads = []
    const uploadedAssetsTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
              })),
            })),
          })),
        })),
      })),
      insert: vi.fn((payload) => {
        uploadedAssetPayloads.push(payload)
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'asset-1',
                ...payload,
              },
              error: null,
            })),
          })),
        }
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({
            error: null,
          })),
        })),
      })),
    }

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
    recordUsageEventMock.mockResolvedValue({
      id: 'usage-event-1',
    })
    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'uploaded_assets') {
          return uploadedAssetsTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: {
        from: vi.fn(() => ({
          info: vi.fn(async () => ({
            data: {
              size: 2048,
              contentType: 'image/png',
              metadata: {},
            },
            error: null,
          })),
          remove: vi.fn(async () => ({
            data: [],
            error: null,
          })),
        })),
      },
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({
        asset_kind: 'brand_reference',
        bucket_name: 'brand-assets',
        storage_path: 'user-1/references/asset-1-reference.png',
        original_file_name: 'Reference.PNG',
        width: 1080,
        height: 1080,
      }),
    }))

    expect(response.status).toBe(200)
    expect(uploadedAssetPayloads[0]).toMatchObject({
      mime_type: 'image/png',
      file_size_bytes: 2048,
    })
  })

  it('stores optimized asset metadata and counts optimized storage bytes', async () => {
    const uploadedAssetPayloads = []
    const uploadedAssetsTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
              })),
            })),
          })),
        })),
      })),
      insert: vi.fn((payload) => {
        uploadedAssetPayloads.push(payload)
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'asset-1',
                ...payload,
              },
              error: null,
            })),
          })),
        }
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({
            error: null,
          })),
        })),
      })),
    }
    const infoMock = vi.fn(async (storagePath: string) => ({
      data: storagePath.includes('/optimized/')
        ? {
          size: 768,
          contentType: 'image/webp',
          metadata: {},
        }
        : {
          size: 2048,
          contentType: 'image/png',
          metadata: {},
        },
      error: null,
    }))

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
    recordUsageEventMock.mockResolvedValue({
      id: 'usage-event-1',
    })
    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'uploaded_assets') {
          return uploadedAssetsTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: {
        from: vi.fn(() => ({
          info: infoMock,
          remove: vi.fn(async () => ({
            data: [],
            error: null,
          })),
        })),
      },
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({
        asset_kind: 'brand_reference',
        bucket_name: 'brand-assets',
        storage_path: 'user-1/references/asset-1-reference.png',
        original_file_name: 'Reference.PNG',
        width: 1800,
        height: 1800,
        optimized_bucket_name: 'brand-assets',
        optimized_storage_path: 'user-1/references/optimized/asset-1-reference.webp',
        optimized_width: 1024,
        optimized_height: 1024,
      }),
    }))

    expect(response.status).toBe(200)
    expect(uploadedAssetPayloads[0]).toMatchObject({
      optimized_bucket_name: 'brand-assets',
      optimized_storage_path: 'user-1/references/optimized/asset-1-reference.webp',
      optimized_mime_type: 'image/webp',
      optimized_file_size_bytes: 768,
      optimized_width: 1024,
      optimized_height: 1024,
    })
    expect(recordUsageEventMock).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      storageBytesDelta: 2816,
    }))
  })
})
