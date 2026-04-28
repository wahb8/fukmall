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

export function assertSupportedUploadAssetKind(assetKind: string): asserts assetKind is SupportedUploadAssetKind {
  if (!SUPPORTED_UPLOAD_ASSET_KINDS.includes(assetKind as SupportedUploadAssetKind)) {
    throw new AppError('VALIDATION_ERROR', 'Unsupported upload asset kind.', 400)
  }
}

export function assertAllowedUploadMimeType(mimeType: string) {
  if (!IMAGE_MIME_TYPES.has(mimeType)) {
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
