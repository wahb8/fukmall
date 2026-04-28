import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  requireAuthenticatedUserMock,
  createAdminClientMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}))

vi.mock('../_shared/auth.ts', () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

vi.mock('../_shared/supabase.ts', () => ({
  createAdminClient: createAdminClientMock,
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
    requireAuthenticatedUserMock.mockReset()
    createAdminClientMock.mockReset()
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
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(async (field, ids) => ({
            data: ids.map((id) => uploadedAssets[id]),
            error: null,
          })),
        })),
      })),
      update: vi.fn((payload) => {
        uploadedAssetUpdatePayloads.push(payload)
        const eqThird = vi.fn(async () => ({
          error: null,
        }))
        const inThird = vi.fn(async () => ({
          error: null,
        }))
        const secondEq = vi.fn(() => ({
          eq: eqThird,
          in: inThird,
        }))
        const firstIn = vi.fn(async () => ({
          error: null,
        }))
        return {
          eq: vi.fn(() => ({
            eq: secondEq,
            in: firstIn,
          })),
        }
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
})
