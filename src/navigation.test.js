import { describe, expect, it } from 'vitest'
import { buildPath, getSafeRedirectPath } from './navigation'

describe('navigation helpers', () => {
  it('builds query strings while skipping empty values', () => {
    expect(buildPath('/auth/callback', {
      next: '/app',
      auth: 'login',
      empty: '',
      nullable: null,
      missing: undefined,
    })).toBe('/auth/callback?next=%2Fapp&auth=login')
  })

  it('allows only local redirect paths', () => {
    expect(getSafeRedirectPath('/pricing?auth=signup', '/app')).toBe('/pricing?auth=signup')
    expect(getSafeRedirectPath('https://evil.example/path', '/app')).toBe('/app')
    expect(getSafeRedirectPath('//evil.example/path', '/app')).toBe('/app')
    expect(getSafeRedirectPath(' pricing ', '/app')).toBe('/app')
  })
})
