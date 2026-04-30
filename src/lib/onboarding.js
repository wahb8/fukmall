import {
  createSignedAssetPreview as createSignedAssetPreviewRecord,
  getRequiredSupabaseClient,
  invokeEdgeFunction,
  uploadAssetFile,
} from './storageAssets'

const BUSINESS_PROFILE_SELECT = `
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
`

const UPLOADED_ASSET_SELECT = `
  id,
  user_id,
  business_profile_id,
  asset_kind,
  bucket_name,
  storage_path,
  original_file_name,
  mime_type,
  file_size_bytes,
  width,
  height,
  created_at
`

async function createSignedAssetPreview(supabase, asset) {
  return createSignedAssetPreviewRecord(supabase, asset, 60 * 60)
}

async function loadBusinessProfileAssets(supabase, profile) {
  let logoAsset = null

  if (profile.logo_asset_id) {
    const { data, error } = await supabase
      .from('uploaded_assets')
      .select(UPLOADED_ASSET_SELECT)
      .eq('id', profile.logo_asset_id)
      .eq('user_id', profile.user_id)
      .maybeSingle()

    if (error) {
      throw new Error(error.message || 'Unable to load the business logo.')
    }

    if (data) {
      logoAsset = await createSignedAssetPreview(supabase, data)
    }
  }

  const { data: referenceAssets, error: referenceAssetsError } = await supabase
    .from('uploaded_assets')
    .select(UPLOADED_ASSET_SELECT)
    .eq('business_profile_id', profile.id)
    .eq('asset_kind', 'brand_reference')
    .order('created_at', { ascending: true })

  if (referenceAssetsError) {
    throw new Error(referenceAssetsError.message || 'Unable to load the reference images.')
  }

  return {
    logoAsset,
    referenceAssets: await Promise.all(
      (referenceAssets ?? []).map((asset) => createSignedAssetPreview(supabase, asset)),
    ),
  }
}

function normalizeHexColor(value) {
  const trimmedValue = String(value ?? '').trim().toUpperCase()

  if (!trimmedValue) {
    return ''
  }

  return trimmedValue.startsWith('#') ? trimmedValue : `#${trimmedValue}`
}

function normalizeAssetIdList(assetIds) {
  return Array.from(
    new Set(
      (assetIds ?? [])
        .map((assetId) => String(assetId ?? '').trim())
        .filter(Boolean),
    ),
  )
}

export async function fetchDefaultBusinessProfile() {
  const supabase = getRequiredSupabaseClient()
  const { data, error } = await supabase
    .from('business_profiles')
    .select(BUSINESS_PROFILE_SELECT)
    .eq('is_default', true)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Unable to load the business profile.')
  }

  if (!data) {
    return null
  }

  const assets = await loadBusinessProfileAssets(supabase, data)

  return {
    ...data,
    tone_preferences: Array.isArray(data.tone_preferences) ? data.tone_preferences : [],
    brand_colors: Array.isArray(data.brand_colors) ? data.brand_colors : [],
    ...assets,
  }
}

export async function saveBusinessProfile({
  name,
  businessType,
  tonePreference,
  brandColors,
  logoFile,
  referenceFiles,
  existingLogoAssetId = null,
  existingReferenceAssetIds = [],
}) {
  const supabase = getRequiredSupabaseClient()
  const uniqueReferenceFiles = Array.from(
    new Map(
      (referenceFiles ?? []).map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]),
    ).values(),
  )

  const logoAsset = logoFile
    ? await uploadAssetFile({
      file: logoFile,
      assetKind: 'logo',
    })
    : null

  const referenceAssets = []

  for (const file of uniqueReferenceFiles) {
    // Sequential uploads keep error handling simple and avoid stampeding the free-tier limits.
    referenceAssets.push(await uploadAssetFile({
      file,
      assetKind: 'brand_reference',
    }))
  }

  const normalizedBrandColors = Array.from(
    new Set((brandColors ?? []).map((value) => normalizeHexColor(value)).filter(Boolean)),
  )
  const referenceAssetIds = [
    ...normalizeAssetIdList(existingReferenceAssetIds),
    ...referenceAssets.map((asset) => asset.id),
  ]

  const saveResult = await invokeEdgeFunction(
    'upsert-business-profile',
    {
      name,
      business_type: businessType,
      tone_preferences: [tonePreference],
      brand_colors: normalizedBrandColors,
      logo_asset_id: logoAsset?.id ?? existingLogoAssetId ?? null,
      reference_asset_ids: referenceAssetIds,
    },
    'Unable to save the business profile.',
  )
  const [
    uploadedLogoAsset,
    uploadedReferenceAssets,
  ] = await Promise.all([
    logoAsset ? createSignedAssetPreview(supabase, logoAsset) : null,
    Promise.all(referenceAssets.map((asset) => createSignedAssetPreview(supabase, asset))),
  ])

  return {
    ...saveResult.business_profile,
    reference_asset_ids: saveResult.reference_asset_ids ?? referenceAssetIds,
    uploadedLogoAsset,
    uploadedReferenceAssets,
  }
}

export async function completeOnboarding(payload) {
  return saveBusinessProfile(payload)
}
