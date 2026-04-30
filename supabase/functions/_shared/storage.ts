import { AppError } from './errors.ts'

export const SUPPORTED_UPLOAD_ASSET_KINDS = [
  'logo',
  'brand_reference',
  'prompt_attachment',
  'chat_attachment',
] as const

export type SupportedUploadAssetKind = typeof SUPPORTED_UPLOAD_ASSET_KINDS[number]

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

const IMAGE_MIME_TYPE_BY_EXTENSION = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
])

const IMAGE_MIME_TYPE_ALIASES = new Map([
  ['image/x-png', 'image/png'],
  ['image/jpg', 'image/jpeg'],
  ['image/pjpeg', 'image/jpeg'],
])

const GENERIC_BROWSER_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
])

const BUCKET_BY_ASSET_KIND: Record<SupportedUploadAssetKind, string> = {
  logo: 'brand-assets',
  brand_reference: 'brand-assets',
  prompt_attachment: 'chat-assets',
  chat_attachment: 'chat-assets',
}

const FOLDER_BY_ASSET_KIND: Record<SupportedUploadAssetKind, string> = {
  logo: 'logos',
  brand_reference: 'references',
  prompt_attachment: 'attachments',
  chat_attachment: 'attachments',
}

const OPTIMIZED_FOLDER_BY_ASSET_KIND: Record<SupportedUploadAssetKind, string> = {
  logo: 'logos/optimized',
  brand_reference: 'references/optimized',
  prompt_attachment: 'attachments/optimized',
  chat_attachment: 'attachments/optimized',
}

const MAX_FILE_SIZE_BYTES_BY_ASSET_KIND: Record<SupportedUploadAssetKind, number> = {
  logo: 6 * 1024 * 1024,
  brand_reference: 12 * 1024 * 1024,
  prompt_attachment: 12 * 1024 * 1024,
  chat_attachment: 12 * 1024 * 1024,
}

function sanitizeFileStem(value: string) {
  const trimmed = value.trim().toLowerCase()
  const sanitized = trimmed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return sanitized || 'upload'
}

function sanitizeFileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]{1,10})$/)
  return match ? `.${match[1]}` : ''
}

export function normalizeUploadMimeType(mimeType: string | null | undefined, fileName = '') {
  const normalizedMimeType = String(mimeType ?? '').trim().toLowerCase()
  const aliasedMimeType = IMAGE_MIME_TYPE_ALIASES.get(normalizedMimeType)

  if (aliasedMimeType) {
    return aliasedMimeType
  }

  if (IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    return normalizedMimeType
  }

  if (GENERIC_BROWSER_MIME_TYPES.has(normalizedMimeType)) {
    const extension = sanitizeFileExtension(fileName)
    return IMAGE_MIME_TYPE_BY_EXTENSION.get(extension) ?? normalizedMimeType
  }

  return normalizedMimeType
}

export function assertSupportedUploadAssetKind(assetKind: string): asserts assetKind is SupportedUploadAssetKind {
  if (!SUPPORTED_UPLOAD_ASSET_KINDS.includes(assetKind as SupportedUploadAssetKind)) {
    throw new AppError('VALIDATION_ERROR', 'Unsupported upload asset kind.', 400)
  }
}

export function assertAllowedUploadMimeType(mimeType: string) {
  if (!IMAGE_MIME_TYPES.has(normalizeUploadMimeType(mimeType))) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Only PNG, JPEG, WEBP, GIF, and SVG image uploads are allowed.',
      400,
    )
  }
}

export function assertAllowedUploadSize(assetKind: SupportedUploadAssetKind, fileSizeBytes: number) {
  const maxFileSizeBytes = MAX_FILE_SIZE_BYTES_BY_ASSET_KIND[assetKind]

  if (!Number.isInteger(fileSizeBytes) || fileSizeBytes <= 0 || fileSizeBytes > maxFileSizeBytes) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Upload size exceeds the allowed limit for ${assetKind.replace('_', ' ')} files.`,
      400,
      {
        max_file_size_bytes: maxFileSizeBytes,
      },
    )
  }
}

export function getBucketForAssetKind(assetKind: SupportedUploadAssetKind) {
  return BUCKET_BY_ASSET_KIND[assetKind]
}

export function getFolderForAssetKind(assetKind: SupportedUploadAssetKind) {
  return FOLDER_BY_ASSET_KIND[assetKind]
}

export function assertOwnedStoragePath(
  userId: string,
  assetKind: SupportedUploadAssetKind,
  storagePath: string,
) {
  const normalizedPath = storagePath.trim().replace(/^\/+/, '')
  const requiredPrefix = `${userId}/${getFolderForAssetKind(assetKind)}/`

  if (!normalizedPath.startsWith(requiredPrefix)) {
    throw new AppError('VALIDATION_ERROR', 'Upload path does not match the current user and asset kind.', 400)
  }

  return normalizedPath
}

export function assertOwnedOptimizedStoragePath(
  userId: string,
  assetKind: SupportedUploadAssetKind,
  storagePath: string,
) {
  const normalizedPath = storagePath.trim().replace(/^\/+/, '')
  const requiredPrefix = `${userId}/${OPTIMIZED_FOLDER_BY_ASSET_KIND[assetKind]}/`

  if (!normalizedPath.startsWith(requiredPrefix)) {
    throw new AppError('VALIDATION_ERROR', 'Optimized upload path does not match the current user and asset kind.', 400)
  }

  return normalizedPath
}

export function buildStoragePath(
  userId: string,
  assetKind: SupportedUploadAssetKind,
  fileName: string,
  resourceId = crypto.randomUUID(),
) {
  const folder = FOLDER_BY_ASSET_KIND[assetKind]
  const extension = sanitizeFileExtension(fileName)
  const fileStem = sanitizeFileStem(fileName.replace(/\.[^.]+$/, ''))

  return `${userId}/${folder}/${resourceId}-${fileStem}${extension}`
}

export function buildOptimizedStoragePath(
  userId: string,
  assetKind: SupportedUploadAssetKind,
  fileName: string,
  resourceId = crypto.randomUUID(),
) {
  const folder = OPTIMIZED_FOLDER_BY_ASSET_KIND[assetKind]
  const fileStem = sanitizeFileStem(fileName.replace(/\.[^.]+$/, ''))

  return `${userId}/${folder}/${resourceId}-${fileStem}.webp`
}

export function buildGeneratedPostStoragePath(userId: string, postId: string, extension = '.png') {
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`
  return `${userId}/renders/${postId}${normalizedExtension}`
}
