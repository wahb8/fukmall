import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertAssetUploadAllowed,
  assertEditAllowed,
  assertGenerationAllowed,
  assertStorageAllowed,
  getOrCreateUsagePeriod,
  recordUsageEvent,
} from './usage.ts'

function createSubscription(overrides = {}) {
  return {
    id: 'sub-1',
    user_id: 'user-1',
    plan_id: 'plan-1',
    status: 'active',
    current_period_start: '2026-04-01T00:00:00.000Z',
    current_period_end: '2026-05-01T00:00:00.000Z',
    renewal_date: '2026-05-01T00:00:00.000Z',
    canceled_at: null,
    expired_at: null,
    cancel_at_period_end: false,
    metadata: {},
    plan: {
      id: 'plan-1',
      code: 'business',
      name: 'Business',
      monthly_generation_limit: 30,
      monthly_edit_limit: 50,
      monthly_storage_limit_bytes: 1024,
      monthly_asset_upload_limit: 10,
      feature_flags: {},
    },
    ...overrides,
  }
}

describe('usage helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-28T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('creates or loads a usage period from the active subscription window', async () => {
    const upsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: {
            id: 'usage-1',
            user_id: 'user-1',
            subscription_id: 'sub-1',
            period_start: '2026-04-01T00:00:00.000Z',
            period_end: '2026-05-01T00:00:00.000Z',
            generation_count: 0,
            edit_count: 0,
            asset_upload_count: 0,
            storage_bytes_used: 0,
          },
          error: null,
        })),
      })),
    }))

    const adminClient = {
      from: vi.fn(() => ({
        upsert,
      })),
    }

    const usagePeriod = await getOrCreateUsagePeriod(adminClient, 'user-1', createSubscription())

    expect(usagePeriod.id).toBe('usage-1')
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: 'user-1',
        subscription_id: 'sub-1',
        period_start: '2026-04-01T00:00:00.000Z',
        period_end: '2026-05-01T00:00:00.000Z',
      },
      {
        onConflict: 'user_id,period_start,period_end',
      },
    )
  })

  it('falls back to the current calendar month when subscription period dates are missing', async () => {
    const upsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: {
            id: 'usage-1',
            user_id: 'user-1',
            subscription_id: 'sub-1',
            period_start: '2026-04-01T00:00:00.000Z',
            period_end: '2026-05-01T00:00:00.000Z',
            generation_count: 0,
            edit_count: 0,
            asset_upload_count: 0,
            storage_bytes_used: 0,
          },
          error: null,
        })),
      })),
    }))

    const adminClient = {
      from: vi.fn(() => ({
        upsert,
      })),
    }

    await getOrCreateUsagePeriod(adminClient, 'user-1', createSubscription({
      current_period_start: null,
      current_period_end: null,
    }))

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        period_start: '2026-04-01T00:00:00.000Z',
        period_end: '2026-05-01T00:00:00.000Z',
      }),
      expect.any(Object),
    )
  })

  it('throws when resolving the usage period fails', async () => {
    const adminClient = {
      from: vi.fn(() => ({
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: null,
              error: { message: 'db failure' },
            })),
          })),
        })),
      })),
    }

    await expect(getOrCreateUsagePeriod(adminClient, 'user-1', createSubscription())).rejects.toMatchObject({
      code: 'USAGE_PERIOD_ERROR',
      status: 500,
    })
  })

  it('enforces generation limits', () => {
    const subscription = createSubscription()

    expect(() =>
      assertGenerationAllowed(
        createSubscription({
          plan: {
            ...subscription.plan,
            monthly_generation_limit: 0,
          },
        }),
        {
          generation_count: 0,
        },
      ),
    ).toThrowError('Your current plan does not allow post generations.')

    expect(() =>
      assertGenerationAllowed(subscription, {
        generation_count: 30,
      }),
    ).toThrowError('Monthly generation limit reached.')

    expect(() =>
      assertGenerationAllowed(subscription, {
        generation_count: 29,
      }),
    ).not.toThrow()
  })

  it('enforces edit limits', () => {
    const subscription = createSubscription()

    expect(() =>
      assertEditAllowed(
        createSubscription({
          plan: {
            ...subscription.plan,
            monthly_edit_limit: 0,
          },
        }),
        {
          edit_count: 0,
        },
      ),
    ).toThrowError('Your current plan does not allow post edits.')

    expect(() =>
      assertEditAllowed(subscription, {
        edit_count: 50,
      }),
    ).toThrowError('Monthly edit limit reached.')

    expect(() =>
      assertEditAllowed(subscription, {
        edit_count: 49,
      }),
    ).not.toThrow()
  })

  it('enforces asset upload and storage limits', () => {
    const subscription = createSubscription()

    expect(() =>
      assertAssetUploadAllowed(
        createSubscription({
          plan: {
            ...subscription.plan,
            monthly_asset_upload_limit: 0,
          },
        }),
        {
          asset_upload_count: 0,
        },
      ),
    ).toThrowError('Your current plan does not allow asset uploads.')

    expect(() =>
      assertAssetUploadAllowed(subscription, {
        asset_upload_count: 10,
      }),
    ).toThrowError('Monthly asset upload limit reached.')

    expect(() =>
      assertAssetUploadAllowed(subscription, {
        asset_upload_count: 9,
      }),
    ).not.toThrow()

    expect(() =>
      assertStorageAllowed(subscription, {
        storage_bytes_used: 1000,
      }, 50),
    ).toThrowError('Monthly storage limit reached.')

    expect(() =>
      assertStorageAllowed(subscription, {
        storage_bytes_used: 512,
      }, 256),
    ).not.toThrow()
  })

  it('records a usage event through the RPC helper', async () => {
    const adminClient = {
      rpc: vi.fn(async () => ({
        data: {
          id: 'usage-event-1',
        },
        error: null,
      })),
    }

    await expect(recordUsageEvent(adminClient, {
      userId: 'user-1',
      usagePeriodId: 'usage-1',
      eventType: 'generation',
      metadata: {
        source: 'test',
      },
    })).resolves.toEqual({
      id: 'usage-event-1',
    })

    expect(adminClient.rpc).toHaveBeenCalledWith('record_usage_event', {
      p_user_id: 'user-1',
      p_usage_period_id: 'usage-1',
      p_event_type: 'generation',
      p_resource_type: null,
      p_resource_id: null,
      p_quantity: 1,
      p_storage_bytes_delta: 0,
      p_metadata: {
        source: 'test',
      },
    })
  })

  it('throws when the usage RPC fails', async () => {
    const adminClient = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: 'rpc failed' },
      })),
    }

    await expect(recordUsageEvent(adminClient, {
      userId: 'user-1',
      usagePeriodId: 'usage-1',
      eventType: 'generation',
    })).rejects.toMatchObject({
      code: 'USAGE_WRITE_FAILED',
      status: 500,
    })
  })
})
