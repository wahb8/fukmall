import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { AppError } from '../_shared/errors.ts'
import { errorResponse, methodNotAllowed, ok, optionsResponse, parseJsonBody } from '../_shared/http.ts'
import { getActiveSubscriptionWithPlan } from '../_shared/plans.ts'
import { createAdminClient } from '../_shared/supabase.ts'
import { getOrCreateUsagePeriod, recordUsageEvent } from '../_shared/usage.ts'

interface UpsertBusinessProfileRequest {
  name: string
  business_type: string
  tone_preferences: string[]
  brand_colors?: string[]
  logo_asset_id?: string | null
  reference_asset_ids?: string[]
}

interface UploadedAssetDeleteCandidate {
  id: string
  bucket_name: string
  storage_path: string
  file_size_bytes: number
  optimized_bucket_name?: string | null
  optimized_storage_path?: string | null
  optimized_file_size_bytes?: number | null
  asset_kind?: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function assertUuid(value: string, fieldName: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid UUID.`, 400)
  }
}

function normalizeTrimmedArray(values: string[], fieldName: string, maxLength = 40) {
  if (!Array.isArray(values)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be an array.`, 400)
  }

  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))]

  normalized.forEach((value) => {
    if (value.length > maxLength) {
      throw new AppError('VALIDATION_ERROR', `${fieldName} entries are too long.`, 400)
    }
  })

  return normalized
}

async function assertOwnedAssets(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  assetIds: string[],
  expectedAssetKind: 'logo' | 'brand_reference',
) {
  if (assetIds.length === 0) {
    return []
  }

  const { data, error } = await adminClient
    .from('uploaded_assets')
    .select('id, asset_kind')
    .eq('user_id', userId)
    .in('id', assetIds)

  if (error) {
    throw new AppError('ASSET_LOOKUP_FAILED', 'Failed to load uploaded assets.', 500)
  }

  if ((data?.length ?? 0) !== assetIds.length) {
    throw new AppError('NOT_FOUND', 'One or more uploaded assets were not found.', 404)
  }

  data.forEach((asset) => {
    if (asset.asset_kind !== expectedAssetKind) {
      throw new AppError('VALIDATION_ERROR', `Uploaded assets must be ${expectedAssetKind.replace('_', ' ')} files.`, 400)
    }
  })

  return data
}

async function loadLinkedReferenceAssets(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  profileId: string,
) {
  const { data, error } = await adminClient
    .from('uploaded_assets')
    .select('id, bucket_name, storage_path, file_size_bytes, optimized_bucket_name, optimized_storage_path, optimized_file_size_bytes, asset_kind')
    .eq('user_id', userId)
    .eq('asset_kind', 'brand_reference')
    .eq('business_profile_id', profileId)

  if (error) {
    throw new AppError('ASSET_LOOKUP_FAILED', 'Failed to load existing reference assets.', 500)
  }

  return (data ?? []) as UploadedAssetDeleteCandidate[]
}

async function loadLinkedReferenceAssetsBestEffort(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  profileId: string,
) {
  try {
    return await loadLinkedReferenceAssets(adminClient, userId, profileId)
  } catch (error) {
    console.error('Failed to load linked reference assets during profile cleanup', error)
    return []
  }
}

async function loadLinkedLogoAssets(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  profileId: string,
) {
  const { data, error } = await adminClient
    .from('uploaded_assets')
    .select('id, bucket_name, storage_path, file_size_bytes, optimized_bucket_name, optimized_storage_path, optimized_file_size_bytes, asset_kind')
    .eq('user_id', userId)
    .eq('asset_kind', 'logo')
    .eq('business_profile_id', profileId)

  if (error) {
    throw new AppError('ASSET_LOOKUP_FAILED', 'Failed to load existing logo assets.', 500)
  }

  return (data ?? []) as UploadedAssetDeleteCandidate[]
}

async function loadLinkedLogoAssetsBestEffort(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  profileId: string,
) {
  try {
    return await loadLinkedLogoAssets(adminClient, userId, profileId)
  } catch (error) {
    console.error('Failed to load linked logo assets during profile cleanup', error)
    return []
  }
}

async function loadStaleUnlinkedAssets(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  assetKind: 'brand_reference' | 'logo',
  preservedAssetIds: Set<string>,
) {
  const { data, error } = await adminClient
    .from('uploaded_assets')
    .select('id, bucket_name, storage_path, file_size_bytes, optimized_bucket_name, optimized_storage_path, optimized_file_size_bytes, asset_kind')
    .eq('user_id', userId)
    .eq('asset_kind', assetKind)
    .is('business_profile_id', null)

  if (error) {
    throw new AppError('ASSET_LOOKUP_FAILED', 'Failed to load stale uploaded assets.', 500)
  }

  return ((data ?? []) as UploadedAssetDeleteCandidate[]).filter((asset) => (
    !preservedAssetIds.has(asset.id)
  ))
}

async function loadStaleUnlinkedAssetsBestEffort(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  assetKind: 'brand_reference' | 'logo',
  preservedAssetIds: Set<string>,
) {
  try {
    return await loadStaleUnlinkedAssets(adminClient, userId, assetKind, preservedAssetIds)
  } catch (error) {
    console.error('Failed to load stale unlinked assets during profile cleanup', error)
    return []
  }
}

async function deleteStoredUploadedAssets(
  adminClient: ReturnType<typeof createAdminClient>,
  assets: UploadedAssetDeleteCandidate[],
) {
  const assetsByBucket = new Map<string, string[]>()

  for (const asset of assets) {
    const paths = assetsByBucket.get(asset.bucket_name) ?? []
    paths.push(asset.storage_path)
    assetsByBucket.set(asset.bucket_name, paths)

    if (asset.optimized_bucket_name && asset.optimized_storage_path) {
      const optimizedPaths = assetsByBucket.get(asset.optimized_bucket_name) ?? []
      optimizedPaths.push(asset.optimized_storage_path)
      assetsByBucket.set(asset.optimized_bucket_name, optimizedPaths)
    }
  }

  for (const [bucketName, storagePaths] of assetsByBucket.entries()) {
    const { error } = await adminClient.storage.from(bucketName).remove(storagePaths)

    if (error) {
      throw new AppError('ASSET_DELETE_FAILED', 'Failed to delete removed uploaded files.', 500)
    }
  }
}

async function deleteUploadedAssetRows(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  assetIds: string[],
) {
  if (assetIds.length === 0) {
    return
  }

  const { error } = await adminClient
    .from('uploaded_assets')
    .delete()
    .eq('user_id', userId)
    .in('id', assetIds)

  if (error) {
    throw new AppError('ASSET_DELETE_FAILED', 'Failed to delete removed uploaded asset metadata.', 500)
  }
}

async function recordDeletedAssetUsage(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  removedAssets: UploadedAssetDeleteCandidate[],
  deletionReason: string,
) {
  if (removedAssets.length === 0) {
    return
  }

  const subscription = await getActiveSubscriptionWithPlan(adminClient, userId)
  const usagePeriod = await getOrCreateUsagePeriod(adminClient, userId, subscription)

  for (const asset of removedAssets) {
    await recordUsageEvent(adminClient, {
      userId,
      usagePeriodId: usagePeriod.id,
      eventType: 'storage_delete',
      resourceType: 'uploaded_asset',
      resourceId: asset.id,
      quantity: 1,
      storageBytesDelta: -Math.max(
        0,
        (asset.file_size_bytes ?? 0) + (asset.optimized_file_size_bytes ?? 0),
      ),
      metadata: {
        asset_kind: asset.asset_kind ?? 'uploaded_asset',
        bucket_name: asset.bucket_name,
        deletion_reason: deletionReason,
      },
    })
  }
}

async function cleanupRemovedAssetsBestEffort(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  removedAssets: UploadedAssetDeleteCandidate[],
  deletionReason: string,
) {
  if (removedAssets.length === 0) {
    return
  }

  try {
    await deleteStoredUploadedAssets(adminClient, removedAssets)
  } catch (error) {
    console.error('Failed to delete removed uploaded files during profile save', error)
  }

  try {
    await deleteUploadedAssetRows(
      adminClient,
      userId,
      removedAssets.map((asset) => asset.id),
    )
  } catch (error) {
    console.error('Failed to delete removed uploaded asset metadata during profile save', error)
  }

  try {
    await recordDeletedAssetUsage(adminClient, userId, removedAssets, deletionReason)
  } catch (error) {
    console.error('Failed to record removed uploaded asset usage during profile save', error)
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return optionsResponse()
  }

  if (request.method !== 'POST') {
    return methodNotAllowed(['POST'])
  }

  try {
    const { user } = await requireAuthenticatedUser(request)
    const body = await parseJsonBody<UpsertBusinessProfileRequest>(request)
    const name = body.name?.trim()
    const businessType = body.business_type?.trim()
    const tonePreferences = normalizeTrimmedArray(body.tone_preferences ?? [], 'tone_preferences')
    const brandColors = normalizeTrimmedArray(body.brand_colors ?? [], 'brand_colors', 7)
      .map((value) => value.toUpperCase())
    const referenceAssetIds = normalizeTrimmedArray(body.reference_asset_ids ?? [], 'reference_asset_ids', 36)
    const logoAssetId = typeof body.logo_asset_id === 'string'
      ? body.logo_asset_id.trim()
      : null

    if (!name || name.length > 120) {
      throw new AppError('VALIDATION_ERROR', 'Business name is required and must be 120 characters or fewer.', 400)
    }

    if (!businessType || businessType.length > 80) {
      throw new AppError('VALIDATION_ERROR', 'business_type is required and must be 80 characters or fewer.', 400)
    }

    if (tonePreferences.length === 0 || tonePreferences.length > 3) {
      throw new AppError('VALIDATION_ERROR', 'Choose between 1 and 3 tone preferences.', 400)
    }

    if (brandColors.length > 4) {
      throw new AppError('VALIDATION_ERROR', 'A maximum of 4 brand colors is allowed.', 400)
    }

    brandColors.forEach((color) => {
      if (!HEX_COLOR_PATTERN.test(color)) {
        throw new AppError('VALIDATION_ERROR', 'Brand colors must be valid hex values.', 400)
      }
    })

    if (referenceAssetIds.length > 5) {
      throw new AppError('VALIDATION_ERROR', 'A maximum of 5 reference assets is allowed.', 400)
    }

    referenceAssetIds.forEach((assetId) => assertUuid(assetId, 'reference_asset_ids'))

    if (logoAssetId) {
      assertUuid(logoAssetId, 'logo_asset_id')
    }

    const adminClient = createAdminClient()

    await assertOwnedAssets(
      adminClient,
      user.id,
      logoAssetId ? [logoAssetId] : [],
      'logo',
    )
    await assertOwnedAssets(
      adminClient,
      user.id,
      referenceAssetIds,
      'brand_reference',
    )

    const { data: existingProfile, error: existingProfileError } = await adminClient
      .from('business_profiles')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle()

    if (existingProfileError) {
      throw new AppError('BUSINESS_PROFILE_LOOKUP_FAILED', 'Failed to load the business profile.', 500)
    }

    let profileId = existingProfile?.id ?? null
    const existingReferenceAssets = profileId
      ? await loadLinkedReferenceAssetsBestEffort(adminClient, user.id, profileId)
      : []
    const existingLogoAssets = profileId
      ? await loadLinkedLogoAssetsBestEffort(adminClient, user.id, profileId)
      : []
    const keptReferenceAssetIds = new Set(referenceAssetIds)
    const keptLogoAssetIds = new Set(logoAssetId ? [logoAssetId] : [])
    const staleUnlinkedReferenceAssets = await loadStaleUnlinkedAssetsBestEffort(
      adminClient,
      user.id,
      'brand_reference',
      keptReferenceAssetIds,
    )
    const staleUnlinkedLogoAssets = await loadStaleUnlinkedAssetsBestEffort(
      adminClient,
      user.id,
      'logo',
      keptLogoAssetIds,
    )
    const removedReferenceAssets = [
      ...existingReferenceAssets.filter((asset) => (
        !keptReferenceAssetIds.has(asset.id)
      )),
      ...staleUnlinkedReferenceAssets,
    ]
    const removedLogoAssets = [
      ...existingLogoAssets.filter((asset) => (
        !keptLogoAssetIds.has(asset.id)
      )),
      ...staleUnlinkedLogoAssets,
    ]

    if (profileId) {
      const { error: updateProfileError } = await adminClient
        .from('business_profiles')
        .update({
          name,
          business_type: businessType,
          tone_preferences: tonePreferences,
          brand_colors: brandColors,
          logo_asset_id: logoAssetId,
        })
        .eq('id', profileId)
        .eq('user_id', user.id)

      if (updateProfileError) {
        throw new AppError('BUSINESS_PROFILE_SAVE_FAILED', 'Failed to update the business profile.', 500)
      }
    } else {
      const { data: createdProfile, error: createProfileError } = await adminClient
        .from('business_profiles')
        .insert({
          user_id: user.id,
          name,
          business_type: businessType,
          tone_preferences: tonePreferences,
          brand_colors: brandColors,
          logo_asset_id: logoAssetId,
          is_default: true,
        })
        .select('id')
        .single()

      if (createProfileError || !createdProfile) {
        throw new AppError('BUSINESS_PROFILE_SAVE_FAILED', 'Failed to create the business profile.', 500)
      }

      profileId = createdProfile.id
    }

    if (removedReferenceAssets.length > 0) {
      await cleanupRemovedAssetsBestEffort(
        adminClient,
        user.id,
        removedReferenceAssets,
        'business_profile_reference_removed',
      )
    }

    if (removedLogoAssets.length > 0) {
      await cleanupRemovedAssetsBestEffort(
        adminClient,
        user.id,
        removedLogoAssets,
        'business_profile_logo_removed',
      )
    }

    if (referenceAssetIds.length > 0) {
      const { error: linkReferenceError } = await adminClient
        .from('uploaded_assets')
        .update({
          business_profile_id: profileId,
        })
        .eq('user_id', user.id)
        .in('id', referenceAssetIds)

      if (linkReferenceError) {
        throw new AppError('ASSET_LINK_FAILED', 'Failed to link the reference assets.', 500)
      }
    }

    const { error: clearLogoError } = await adminClient
      .from('uploaded_assets')
      .update({
        business_profile_id: null,
      })
      .eq('user_id', user.id)
      .eq('asset_kind', 'logo')
      .eq('business_profile_id', profileId)

    if (clearLogoError) {
      throw new AppError('ASSET_LINK_FAILED', 'Failed to refresh logo links.', 500)
    }

    if (logoAssetId) {
      const { error: linkLogoError } = await adminClient
        .from('uploaded_assets')
        .update({
          business_profile_id: profileId,
        })
        .eq('id', logoAssetId)
        .eq('user_id', user.id)

      if (linkLogoError) {
        throw new AppError('ASSET_LINK_FAILED', 'Failed to link the logo asset.', 500)
      }
    }

    const { data: savedProfile, error: savedProfileError } = await adminClient
      .from('business_profiles')
      .select(`
        id,
        user_id,
        name,
        business_type,
        tone_preferences,
        brand_colors,
        logo_asset_id,
        is_default,
        created_at,
        updated_at
      `)
      .eq('id', profileId)
      .eq('user_id', user.id)
      .single()

    if (savedProfileError || !savedProfile) {
      throw new AppError('BUSINESS_PROFILE_LOOKUP_FAILED', 'Failed to reload the saved business profile.', 500)
    }

    return ok({
      business_profile: savedProfile,
      reference_asset_ids: referenceAssetIds,
    })
  } catch (error) {
    return errorResponse(error)
  }
})
