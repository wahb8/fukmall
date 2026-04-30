import { describe, expect, it } from 'vitest'
import {
  assertAllowedUploadMimeType,
  assertAllowedUploadSize,
  assertOwnedOptimizedStoragePath,
  assertOwnedStoragePath,
  assertSupportedUploadAssetKind,
  buildOptimizedStoragePath,
  buildStoragePath,
  getBucketForAssetKind,
  normalizeUploadMimeType,
} from './storage.ts'

describe('storage helpers', () => {
  it('maps supported asset kinds to the expected buckets and paths', () => {
    expect(getBucketForAssetKind('logo')).toBe('brand-assets')
    expect(getBucketForAssetKind('brand_reference')).toBe('brand-assets')
    expect(getBucketForAssetKind('prompt_attachment')).toBe('chat-assets')

    expect(buildStoragePath(
      'user-1',
      'logo',
      'Brand Kit Final.PNG',
      'resource-1',
    )).toBe('user-1/logos/resource-1-brand-kit-final.png')

    expect(buildOptimizedStoragePath(
      'user-1',
      'brand_reference',
      'Mood Board.PNG',
      'resource-2',
    )).toBe('user-1/references/optimized/resource-2-mood-board.webp')
  })

  it('validates asset kinds, mime types, sizes, and owned storage paths', () => {
    expect(() => assertSupportedUploadAssetKind('logo')).not.toThrow()
    expect(() => assertSupportedUploadAssetKind('other')).toThrowError('Unsupported upload asset kind.')

    expect(() => assertAllowedUploadMimeType('image/png')).not.toThrow()
    expect(() => assertAllowedUploadMimeType('application/pdf')).toThrowError(
      'Only PNG, JPEG, WEBP, GIF, and SVG image uploads are allowed.',
    )

    expect(() => assertAllowedUploadSize('logo', 1024)).not.toThrow()
    expect(() => assertAllowedUploadSize('logo', 10 * 1024 * 1024)).toThrowError(
      'Upload size exceeds the allowed limit for logo files.',
    )

    expect(assertOwnedStoragePath(
      'user-1',
      'brand_reference',
      'user-1/references/file.png',
    )).toBe('user-1/references/file.png')

    expect(() => assertOwnedStoragePath(
      'user-1',
      'logo',
      'user-2/logos/file.png',
    )).toThrowError('Upload path does not match the current user and asset kind.')

    expect(assertOwnedOptimizedStoragePath(
      'user-1',
      'prompt_attachment',
      'user-1/attachments/optimized/file.webp',
    )).toBe('user-1/attachments/optimized/file.webp')

    expect(() => assertOwnedOptimizedStoragePath(
      'user-1',
      'prompt_attachment',
      'user-1/attachments/file.webp',
    )).toThrowError('Optimized upload path does not match the current user and asset kind.')
  })

  it('normalizes browser MIME aliases and generic image uploads by extension', () => {
    expect(normalizeUploadMimeType('image/x-png', 'brand.PNG')).toBe('image/png')
    expect(normalizeUploadMimeType('image/jpg', 'photo.jpg')).toBe('image/jpeg')
    expect(normalizeUploadMimeType('application/octet-stream', 'brand.PNG')).toBe('image/png')
    expect(normalizeUploadMimeType('', 'reference.webp')).toBe('image/webp')
    expect(normalizeUploadMimeType('application/pdf', 'fake.png')).toBe('application/pdf')

    expect(() => assertAllowedUploadMimeType(normalizeUploadMimeType('image/x-png', 'brand.png'))).not.toThrow()
    expect(() => assertAllowedUploadMimeType(normalizeUploadMimeType('application/pdf', 'fake.png'))).toThrowError(
      'Only PNG, JPEG, WEBP, GIF, and SVG image uploads are allowed.',
    )
  })
})
