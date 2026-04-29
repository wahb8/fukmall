import { describe, expect, it } from 'vitest'
import { resolveUploadMimeType } from './storageAssets'

describe('storageAssets', () => {
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
})
