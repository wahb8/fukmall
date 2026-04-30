import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSignedStorageUrlCache,
  createSignedStorageUrl,
  OPTIMIZED_REFERENCE_MAX_DIMENSION,
  OPTIMIZED_REFERENCE_MIME_TYPE,
  rememberSignedStorageUrl,
  resolveUploadMimeType,
  shouldCreateOptimizedAssetUpload,
} from './storageAssets'

describe('storageAssets', () => {
  beforeEach(() => {
    clearSignedStorageUrlCache()
  })

  it('normalizes common image upload MIME variants', () => {
    expect(resolveUploadMimeType(new File(['image'], 'brand.PNG', {
      type: 'application/octet-stream',
    }))).toBe('image/png')
    expect(resolveUploadMimeType(new File(['image'], 'brand.png', {
      type: 'image/x-png',
    }))).toBe('image/png')
    expect(resolveUploadMimeType(new File(['image'], 'photo.jpg', {
      type: 'image/jpg',
    }))).toBe('image/jpeg')
  })

  it('only prepares browser-side optimized copies for raster formats supported by OpenAI references', () => {
    expect(OPTIMIZED_REFERENCE_MIME_TYPE).toBe('image/webp')
    expect(OPTIMIZED_REFERENCE_MAX_DIMENSION).toBe(1024)
    expect(shouldCreateOptimizedAssetUpload(new File(['image'], 'brand.png', {
      type: 'image/png',
    }), 'image/png')).toBe(true)
    expect(shouldCreateOptimizedAssetUpload(new File(['image'], 'brand.jpg', {
      type: 'image/jpeg',
    }), 'image/jpeg')).toBe(true)
    expect(shouldCreateOptimizedAssetUpload(new File(['image'], 'motion.gif', {
      type: 'image/gif',
    }), 'image/gif')).toBe(false)
    expect(shouldCreateOptimizedAssetUpload(new File(['image'], 'mark.svg', {
      type: 'image/svg+xml',
    }), 'image/svg+xml')).toBe(false)
  })

  it('reuses cached signed storage URLs for the same asset path', async () => {
    const createSignedUrlMock = vi.fn(async () => ({
      data: {
        signedUrl: 'https://example.com/signed/post-1.png',
      },
      error: null,
    }))
    const fromMock = vi.fn(() => ({
      createSignedUrl: createSignedUrlMock,
    }))
    const supabase = {
      storage: {
        from: fromMock,
      },
    }

    await expect(createSignedStorageUrl(
      supabase,
      'generated-posts',
      'user-1/renders/post-1.png',
    )).resolves.toBe('https://example.com/signed/post-1.png')
    await expect(createSignedStorageUrl(
      supabase,
      'generated-posts',
      'user-1/renders/post-1.png',
    )).resolves.toBe('https://example.com/signed/post-1.png')

    expect(fromMock).toHaveBeenCalledTimes(1)
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1)
  })

  it('can remember a signed URL returned by an edge function before the next session reload', async () => {
    const fromMock = vi.fn()
    const supabase = {
      storage: {
        from: fromMock,
      },
    }

    rememberSignedStorageUrl(
      'generated-posts',
      'user-1/renders/post-2.png',
      'https://edge.example.com/signed/post-2.png',
    )

    await expect(createSignedStorageUrl(
      supabase,
      'generated-posts',
      'user-1/renders/post-2.png',
    )).resolves.toBe('https://edge.example.com/signed/post-2.png')

    expect(fromMock).not.toHaveBeenCalled()
  })
})
