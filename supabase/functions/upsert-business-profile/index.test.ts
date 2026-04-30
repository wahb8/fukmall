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

vi.mock('../_shared/usage.ts', () => ({
  getOrCreateUsagePeriod: getOrCreateUsagePeriodMock,
  recordUsageEvent: recordUsageEventMock,
}))

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

describe('upsert-business-profile edge function', () => {
  beforeEach(() => {
    delete (globalThis as typeof globalThis & { EdgeRuntime?: unknown }).EdgeRuntime
    requireAuthenticatedUserMock.mockReset()
    createAdminClientMock.mockReset()
    getActiveSubscriptionWithPlanMock.mockReset()
    getOrCreateUsagePeriodMock.mockReset()
    recordUsageEventMock.mockReset()
  })

  it('creates a default business profile and links the chosen assets', async () => {
    const businessProfileInsertPayloads = []
    const uploadedAssetUpdatePayloads = []
    const logoAssetId = '11111111-1111-4111-8111-111111111111'
    const referenceAssetId = '22222222-2222-4222-8222-222222222222'
    const uploadedAssets = {
      [logoAssetId]: { id: logoAssetId, asset_kind: 'logo' },
      [referenceAssetId]: { id: referenceAssetId, asset_kind: 'brand_reference' },
    }

    const uploadedAssetsTable = {
      select: vi.fn((columns) => {
        if (columns === 'id, asset_kind') {
          return {
            eq: vi.fn(() => ({
              in: vi.fn(async (field, ids) => ({
                data: ids.map((id) => uploadedAssets[id]),
                error: null,
              })),
            })),
          }
        }

        const result = {
          data: [],
          error: null,
        }
        const chain = {
          eq: vi.fn(() => chain),
          is: vi.fn(() => chain),
          lt: vi.fn(() => chain),
          then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
        }

        return chain
      }),
      update: vi.fn((payload) => {
        uploadedAssetUpdatePayloads.push(payload)
        const result = { error: null }
        const chain = {
          eq: vi.fn(() => chain),
          in: vi.fn(() => chain),
          not: vi.fn(() => chain),
          then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
        }

        return chain
      }),
    }

    const businessProfilesTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: null,
              error: null,
            })),
          })),
        })),
      })),
      insert: vi.fn((payload) => {
        businessProfileInsertPayloads.push(payload)
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'profile-1',
              },
              error: null,
            })),
          })),
        }
      }),
    }

    const reloadedBusinessProfilesTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'profile-1',
                user_id: 'user-1',
                name: 'Moonline Cafe',
                business_type: 'Cafe',
                tone_preferences: ['Warm and friendly'],
                brand_colors: ['#D97706'],
                logo_asset_id: logoAssetId,
                is_default: true,
              },
              error: null,
            })),
          })),
        })),
      })),
    }

    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    })
    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'uploaded_assets') {
          return uploadedAssetsTable
        }

        if (table === 'business_profiles') {
          if (businessProfileInsertPayloads.length === 0) {
            return businessProfilesTable
          }

          return reloadedBusinessProfilesTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Moonline Cafe',
        business_type: 'Cafe',
        tone_preferences: ['Warm and friendly'],
        brand_colors: ['#D97706'],
        logo_asset_id: logoAssetId,
        reference_asset_ids: [referenceAssetId],
      }),
    }))

    expect(businessProfileInsertPayloads[0]).toMatchObject({
      user_id: 'user-1',
      name: 'Moonline Cafe',
      business_type: 'Cafe',
      tone_preferences: ['Warm and friendly'],
      brand_colors: ['#D97706'],
      logo_asset_id: logoAssetId,
      is_default: true,
    })
    expect(uploadedAssetUpdatePayloads).toHaveLength(4)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        business_profile: {
          id: 'profile-1',
          name: 'Moonline Cafe',
        },
        reference_asset_ids: [referenceAssetId],
      },
    })
  })

  it('deletes removed profile reference and logo assets from storage and metadata', async () => {
    const keptReferenceAssetId = '22222222-2222-4222-8222-222222222222'
    const removedReferenceAssetId = '33333333-3333-4333-8333-333333333333'
    const removedLogoAssetId = '55555555-5555-4555-8555-555555555555'
    const removedStoragePath = 'user-1/references/removed-reference.png'
    const removedLogoStoragePath = 'user-1/logos/removed-logo.png'
    const uploadedAssetUpdates = []
    const removedStorageObjects = []
    const deletedAssetIds = []
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

    const existingProfileQuery = {
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: {
              id: 'profile-1',
            },
            error: null,
          })),
        })),
      })),
    }
    const reloadedProfileQuery = {
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              id: 'profile-1',
              user_id: 'user-1',
              name: 'Moonline Cafe',
              business_type: 'Cafe',
              tone_preferences: ['Premium'],
              brand_colors: [],
              logo_asset_id: null,
              is_default: true,
            },
            error: null,
          })),
        })),
      })),
    }
    const businessProfilesTable = {
      select: vi.fn()
        .mockReturnValueOnce(existingProfileQuery)
        .mockReturnValueOnce(reloadedProfileQuery),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({
            error: null,
          })),
        })),
      })),
    }

    function createUploadedAssetLookupQuery(resultsByKey) {
      let selectedAssetKind = ''
      let isStaleLookup = false
      const chain = {
        eq: vi.fn((field, value) => {
          if (field === 'asset_kind') {
            selectedAssetKind = value
          }

          return chain
        }),
        is: vi.fn(() => {
          isStaleLookup = true
          return chain
        }),
        lt: vi.fn(() => chain),
        then: (onFulfilled, onRejected) => {
          const key = `${isStaleLookup ? 'stale' : 'linked'}:${selectedAssetKind}`
          return Promise.resolve(resultsByKey[key] ?? { data: [], error: null }).then(onFulfilled, onRejected)
        },
      }

      return chain
    }

    const uploadedAssetLookupResults = {
      'linked:brand_reference': {
        data: [
          {
            id: keptReferenceAssetId,
            asset_kind: 'brand_reference',
            bucket_name: 'brand-assets',
            storage_path: 'user-1/references/kept-reference.png',
            file_size_bytes: 1200,
          },
          {
            id: removedReferenceAssetId,
            asset_kind: 'brand_reference',
            bucket_name: 'brand-assets',
            storage_path: removedStoragePath,
            file_size_bytes: 2400,
          },
        ],
        error: null,
      },
      'linked:logo': {
        data: [
          {
            id: removedLogoAssetId,
            asset_kind: 'logo',
            bucket_name: 'brand-assets',
            storage_path: removedLogoStoragePath,
            file_size_bytes: 3200,
          },
        ],
        error: null,
      },
      'stale:brand_reference': {
        data: [
          {
            id: removedReferenceAssetId,
            asset_kind: 'brand_reference',
            bucket_name: 'brand-assets',
            storage_path: removedStoragePath,
            file_size_bytes: 2400,
          },
          {
            id: '44444444-4444-4444-8444-444444444444',
            asset_kind: 'brand_reference',
            bucket_name: 'brand-assets',
            storage_path: 'user-1/references/stale-reference.png',
            file_size_bytes: 1800,
          },
        ],
        error: null,
      },
      'stale:logo': {
        data: [
          {
            id: removedLogoAssetId,
            asset_kind: 'logo',
            bucket_name: 'brand-assets',
            storage_path: removedLogoStoragePath,
            file_size_bytes: 3200,
          },
          {
            id: '66666666-6666-4666-8666-666666666666',
            asset_kind: 'logo',
            bucket_name: 'brand-assets',
            storage_path: 'user-1/logos/stale-logo.png',
            file_size_bytes: 1600,
          },
        ],
        error: null,
      },
    }

    const uploadedAssetsTable = {
      select: vi.fn((columns) => {
        if (columns === 'id, asset_kind') {
          return {
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [
                  {
                    id: keptReferenceAssetId,
                    asset_kind: 'brand_reference',
                  },
                ],
                error: null,
              })),
            })),
          }
        }

        return createUploadedAssetLookupQuery(uploadedAssetLookupResults)
      }),
      update: vi.fn((payload) => {
        uploadedAssetUpdates.push(payload)
        const chain = {
          eq: vi.fn(() => chain),
          in: vi.fn(() => chain),
          not: vi.fn(() => chain),
          then: (onFulfilled, onRejected) => Promise.resolve({ error: null }).then(onFulfilled, onRejected),
        }

        return chain
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(async (field, assetIds) => {
            deletedAssetIds.push(...assetIds)

            return {
              error: null,
            }
          }),
        })),
      })),
    }

    requireAuthenticatedUserMock.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    })
    getActiveSubscriptionWithPlanMock.mockResolvedValue({
      id: 'subscription-1',
      plan: {},
    })
    getOrCreateUsagePeriodMock.mockResolvedValue({
      id: 'usage-period-1',
    })
    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'business_profiles') {
          return businessProfilesTable
        }

        if (table === 'uploaded_assets') {
          return uploadedAssetsTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn(async (storagePaths) => {
            removedStorageObjects.push(...storagePaths)

            return {
              error: null,
            }
          }),
        })),
      },
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Moonline Cafe',
        business_type: 'Cafe',
        tone_preferences: ['Premium'],
        brand_colors: [],
        logo_asset_id: null,
        reference_asset_ids: [keptReferenceAssetId],
      }),
    }))

    expect(response.status).toBe(200)
    expect((globalThis as typeof globalThis & {
      EdgeRuntime?: {
        waitUntil: ReturnType<typeof vi.fn>
      }
    }).EdgeRuntime?.waitUntil).toHaveBeenCalledTimes(1)
    await Promise.all(backgroundTasks)
    expect(removedStorageObjects).toEqual([
      removedStoragePath,
      'user-1/references/stale-reference.png',
      removedLogoStoragePath,
      'user-1/logos/stale-logo.png',
    ])
    expect(deletedAssetIds).toEqual([
      removedReferenceAssetId,
      '44444444-4444-4444-8444-444444444444',
      removedLogoAssetId,
      '66666666-6666-4666-8666-666666666666',
    ])
    expect(uploadedAssetUpdates).toContainEqual({
      business_profile_id: 'profile-1',
    })
    expect(recordUsageEventMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: 'storage_delete',
      resourceId: removedReferenceAssetId,
      storageBytesDelta: -2400,
    }))
    expect(recordUsageEventMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: 'storage_delete',
      resourceId: removedLogoAssetId,
      storageBytesDelta: -3200,
      metadata: expect.objectContaining({
        asset_kind: 'logo',
        deletion_reason: 'business_profile_logo_removed',
      }),
    }))
  })

  it('still saves new reference links when stale asset cleanup fails', async () => {
    const newReferenceAssetId = '22222222-2222-4222-8222-222222222222'
    const staleReferenceAssetId = '33333333-3333-4333-8333-333333333333'
    const linkedReferenceUpdates = []

    const businessProfilesTable = {
      select: vi.fn()
        .mockReturnValueOnce({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'profile-1',
                },
                error: null,
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'profile-1',
                  user_id: 'user-1',
                  name: 'Moonline Cafe',
                  business_type: 'Cafe',
                  tone_preferences: ['Warm'],
                  brand_colors: [],
                  logo_asset_id: null,
                  is_default: true,
                },
                error: null,
              })),
            })),
          })),
        }),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({
            error: null,
          })),
        })),
      })),
    }

    function createAssetListQuery(data) {
      const result = {
        data,
        error: null,
      }
      const chain = {
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        lt: vi.fn(() => chain),
        then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
      }

      return chain
    }

    const uploadedAssetsTable = {
      select: vi.fn((columns) => {
        if (columns === 'id, asset_kind') {
          return {
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [
                  {
                    id: newReferenceAssetId,
                    asset_kind: 'brand_reference',
                  },
                ],
                error: null,
              })),
            })),
          }
        }

        return createAssetListQuery([
          {
            id: staleReferenceAssetId,
            asset_kind: 'brand_reference',
            bucket_name: 'brand-assets',
            storage_path: 'user-1/references/stale-reference.png',
            file_size_bytes: 1200,
          },
        ])
      }),
      update: vi.fn((payload) => {
        const chain = {
          eq: vi.fn(() => chain),
          in: vi.fn(() => {
            linkedReferenceUpdates.push(payload)
            return chain
          }),
          not: vi.fn(() => chain),
          then: (onFulfilled, onRejected) => Promise.resolve({ error: null }).then(onFulfilled, onRejected),
        }

        return chain
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(async () => ({
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
    getActiveSubscriptionWithPlanMock.mockRejectedValue(new Error('No active subscription'))
    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'business_profiles') {
          return businessProfilesTable
        }

        if (table === 'uploaded_assets') {
          return uploadedAssetsTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn(async () => ({
            error: {
              message: 'Storage object is already gone',
            },
          })),
        })),
      },
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Moonline Cafe',
        business_type: 'Cafe',
        tone_preferences: ['Warm'],
        brand_colors: [],
        logo_asset_id: null,
        reference_asset_ids: [newReferenceAssetId],
      }),
    }))

    expect(response.status).toBe(200)
    expect(linkedReferenceUpdates).toContainEqual({
      business_profile_id: 'profile-1',
    })
    expect(recordUsageEventMock).not.toHaveBeenCalled()
  })
})
