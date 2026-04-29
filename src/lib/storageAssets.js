import { getSupabaseBrowserClient } from './supabaseBrowser'

export function getRequiredSupabaseClient(configErrorMessage = 'Supabase is not configured.') {
  const supabase = getSupabaseBrowserClient()

  if (!supabase) {
    throw new Error(configErrorMessage)
  }

  return supabase
}

const UPLOAD_MIME_TYPE_BY_EXTENSION = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
])

const UPLOAD_MIME_TYPE_ALIASES = new Map([
  ['image/x-png', 'image/png'],
  ['image/jpg', 'image/jpeg'],
  ['image/pjpeg', 'image/jpeg'],
])

const GENERIC_UPLOAD_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
])

export function resolveUploadMimeType(file) {
  const normalizedMimeType = String(file?.type ?? '').trim().toLowerCase()
  const aliasedMimeType = UPLOAD_MIME_TYPE_ALIASES.get(normalizedMimeType)

  if (aliasedMimeType) {
    return aliasedMimeType
  }

  if (!GENERIC_UPLOAD_MIME_TYPES.has(normalizedMimeType)) {
    return normalizedMimeType
  }

  const fileName = String(file?.name ?? '').trim().toLowerCase()
  const extensionMatch = fileName.match(/\.([a-z0-9]{1,10})$/)
  const extension = extensionMatch ? `.${extensionMatch[1]}` : ''

  return UPLOAD_MIME_TYPE_BY_EXTENSION.get(extension) ?? normalizedMimeType
}

async function extractFunctionErrorMessage(error, fallbackMessage) {
  if (error?.context instanceof Response) {
    try {
      const payload = await error.context.json()
      return payload?.error?.message || fallbackMessage
    } catch {
      return fallbackMessage
    }
  }

  return error?.message || fallbackMessage
}

export async function invokeEdgeFunction(functionName, body, fallbackMessage) {
  const supabase = getRequiredSupabaseClient()
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  })

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error, fallbackMessage))
  }

  if (!data?.ok) {
    throw new Error(data?.error?.message || fallbackMessage)
  }

  return data.data
}

export async function readImageDimensions(file) {
  if (!(file instanceof File)) {
    return {
      width: null,
      height: null,
    }
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      resolve({
        width: Number.isFinite(image.naturalWidth) && image.naturalWidth > 0
          ? image.naturalWidth
          : null,
        height: Number.isFinite(image.naturalHeight) && image.naturalHeight > 0
          ? image.naturalHeight
          : null,
      })
      URL.revokeObjectURL(objectUrl)
    }

    image.onerror = () => {
      resolve({
        width: null,
        height: null,
      })
      URL.revokeObjectURL(objectUrl)
    }

    image.src = objectUrl
  })
}

export async function createSignedStorageUrl(
  supabase,
  bucketName,
  storagePath,
  expiresInSeconds = 60 * 60,
) {
  if (!bucketName || !storagePath) {
    return null
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error) {
    return null
  }

  return data?.signedUrl ?? null
}

export async function createSignedAssetPreview(supabase, asset, expiresInSeconds = 60 * 60) {
  const previewUrl = await createSignedStorageUrl(
    supabase,
    asset.bucket_name,
    asset.storage_path,
    expiresInSeconds,
  )

  return {
    ...asset,
    previewUrl,
  }
}

export async function uploadAssetFile({
  file,
  assetKind,
  chatId = null,
}) {
  const supabase = getRequiredSupabaseClient()
  const mimeType = resolveUploadMimeType(file)
  const prepareResult = await invokeEdgeFunction(
    'prepare-upload',
    {
      asset_kind: assetKind,
      file_name: file.name,
      mime_type: mimeType,
      file_size_bytes: file.size,
      chat_id: chatId,
    },
    'Unable to prepare the upload.',
  )

  const { bucket_name: bucketName, storage_path: storagePath, token } = prepareResult.upload
  const uploadResult = await supabase.storage
    .from(bucketName)
    .uploadToSignedUrl(storagePath, token, file, {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message || 'Unable to upload the file.')
  }

  const dimensions = await readImageDimensions(file)
  const finalizeResult = await invokeEdgeFunction(
    'finalize-upload',
    {
      asset_kind: assetKind,
      bucket_name: bucketName,
      storage_path: storagePath,
      original_file_name: file.name,
      width: dimensions.width,
      height: dimensions.height,
      chat_id: chatId,
    },
    'Unable to finalize the upload.',
  )

  return finalizeResult.asset
}
