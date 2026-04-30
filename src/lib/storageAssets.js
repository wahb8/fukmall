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

const OPTIMIZABLE_UPLOAD_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
])

export const OPTIMIZED_REFERENCE_MIME_TYPE = 'image/webp'
export const OPTIMIZED_REFERENCE_MAX_DIMENSION = 1024
export const OPTIMIZED_REFERENCE_QUALITY = 0.82
export const OPTIMIZED_REFERENCE_RECOMPRESSION_THRESHOLD_BYTES = 1024 * 1024

const SIGNED_URL_EXPIRY_BUFFER_MS = 5 * 60 * 1000
const signedStorageUrlCache = new Map()

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

export function shouldCreateOptimizedAssetUpload(file, mimeType) {
  return file instanceof File && OPTIMIZABLE_UPLOAD_MIME_TYPES.has(mimeType)
}

function buildSignedStorageUrlCacheKey(bucketName, storagePath) {
  return `${String(bucketName ?? '').trim()}::${String(storagePath ?? '').trim()}`
}

function getCachedSignedStorageUrl(bucketName, storagePath, now = Date.now()) {
  const cacheKey = buildSignedStorageUrlCacheKey(bucketName, storagePath)
  const cachedEntry = signedStorageUrlCache.get(cacheKey)

  if (!cachedEntry || cachedEntry.expiresAt <= now + SIGNED_URL_EXPIRY_BUFFER_MS) {
    signedStorageUrlCache.delete(cacheKey)
    return null
  }

  return cachedEntry.signedUrl
}

export function rememberSignedStorageUrl(
  bucketName,
  storagePath,
  signedUrl,
  expiresInSeconds = 60 * 60,
) {
  if (!bucketName || !storagePath || !signedUrl) {
    return
  }

  signedStorageUrlCache.set(buildSignedStorageUrlCacheKey(bucketName, storagePath), {
    signedUrl,
    expiresAt: Date.now() + (expiresInSeconds * 1000),
  })
}

export function clearSignedStorageUrlCache() {
  signedStorageUrlCache.clear()
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

export async function invokeEdgeFunction(functionName, body, fallbackMessage, options = {}) {
  const supabase = getRequiredSupabaseClient()
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    signal: options.signal ?? undefined,
    timeout: options.timeout ?? undefined,
  })

  if (error) {
    const errorMessage = await extractFunctionErrorMessage(error, fallbackMessage)
    throw new Error(`${functionName}: ${errorMessage}`)
  }

  if (!data?.ok) {
    throw new Error(`${functionName}: ${data?.error?.message || fallbackMessage}`)
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

function loadImageFromFile(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
    }

    image.onload = () => {
      const width = Number.isFinite(image.naturalWidth) && image.naturalWidth > 0
        ? image.naturalWidth
        : null
      const height = Number.isFinite(image.naturalHeight) && image.naturalHeight > 0
        ? image.naturalHeight
        : null

      cleanup()
      resolve({ image, width, height })
    }

    image.onerror = () => {
      cleanup()
      resolve({ image: null, width: null, height: null })
    }

    image.src = objectUrl
  })
}

function shouldResizeOrRecompressImage(file, width, height, maxDimension) {
  return width > maxDimension ||
    height > maxDimension ||
    file.size > OPTIMIZED_REFERENCE_RECOMPRESSION_THRESHOLD_BYTES
}

function createCanvasBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob)
    }, mimeType, quality)
  })
}

export async function createOptimizedAssetUpload(file, mimeType, options = {}) {
  if (!shouldCreateOptimizedAssetUpload(file, mimeType)) {
    return null
  }

  if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL === 'undefined') {
    return null
  }

  const maxDimension = options.maxDimension ?? OPTIMIZED_REFERENCE_MAX_DIMENSION
  const quality = options.quality ?? OPTIMIZED_REFERENCE_QUALITY
  const { image, width, height } = await loadImageFromFile(file)

  if (!image || !width || !height || !shouldResizeOrRecompressImage(file, width, height, maxDimension)) {
    return null
  }

  const scale = Math.min(1, maxDimension / Math.max(width, height))
  const optimizedWidth = Math.max(1, Math.round(width * scale))
  const optimizedHeight = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')

  canvas.width = optimizedWidth
  canvas.height = optimizedHeight

  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  context.drawImage(image, 0, 0, optimizedWidth, optimizedHeight)

  const blob = await createCanvasBlob(canvas, OPTIMIZED_REFERENCE_MIME_TYPE, quality)

  if (!(blob instanceof Blob) || blob.size <= 0 || blob.size >= file.size) {
    return null
  }

  return {
    blob,
    mimeType: OPTIMIZED_REFERENCE_MIME_TYPE,
    width: optimizedWidth,
    height: optimizedHeight,
  }
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

  const cachedSignedUrl = getCachedSignedStorageUrl(bucketName, storagePath)

  if (cachedSignedUrl) {
    return cachedSignedUrl
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error) {
    return null
  }

  const signedUrl = data?.signedUrl ?? null

  rememberSignedStorageUrl(bucketName, storagePath, signedUrl, expiresInSeconds)

  return signedUrl
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
  let optimizedUpload = null

  if (prepareResult.optimized_upload) {
    try {
      const optimizedAsset = await createOptimizedAssetUpload(file, mimeType)

      if (optimizedAsset) {
        const optimizedUploadResult = await supabase.storage
          .from(prepareResult.optimized_upload.bucket_name)
          .uploadToSignedUrl(
            prepareResult.optimized_upload.storage_path,
            prepareResult.optimized_upload.token,
            optimizedAsset.blob,
            {
              contentType: optimizedAsset.mimeType,
              upsert: false,
            },
          )

        if (!optimizedUploadResult.error) {
          optimizedUpload = {
            bucket_name: prepareResult.optimized_upload.bucket_name,
            storage_path: prepareResult.optimized_upload.storage_path,
            width: optimizedAsset.width,
            height: optimizedAsset.height,
          }
        } else {
          console.warn('Optimized asset upload failed', optimizedUploadResult.error)
        }
      }
    } catch (error) {
      console.warn('Optimized asset creation failed', error)
    }
  }

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
      ...(optimizedUpload
        ? {
          optimized_bucket_name: optimizedUpload.bucket_name,
          optimized_storage_path: optimizedUpload.storage_path,
          optimized_width: optimizedUpload.width,
          optimized_height: optimizedUpload.height,
        }
        : {}),
    },
    'Unable to finalize the upload.',
  )

  return finalizeResult.asset
}
