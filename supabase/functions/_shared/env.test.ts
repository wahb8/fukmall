import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('getRequiredEnv', () => {
  const originalDeno = globalThis.Deno

  beforeEach(() => {
    globalThis.Deno = {
      env: {
        get: vi.fn(),
      },
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.Deno = originalDeno
  })

  it('returns the configured environment variable', async () => {
    globalThis.Deno.env.get.mockReturnValue('configured')
    const { getRequiredEnv } = await import('./env.ts')

    expect(getRequiredEnv('OPENAI_API_KEY')).toBe('configured')
    expect(globalThis.Deno.env.get).toHaveBeenCalledWith('OPENAI_API_KEY')
  })

  it('throws an AppError when the variable is missing', async () => {
    globalThis.Deno.env.get.mockReturnValue('')
    const { getRequiredEnv } = await import('./env.ts')

    expect(() => getRequiredEnv('SUPABASE_URL')).toThrowError(
      'Missing required environment variable: SUPABASE_URL',
    )
  })
})
