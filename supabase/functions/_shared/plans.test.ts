import { describe, expect, it, vi } from 'vitest'
import { getActiveSubscriptionWithPlan, getPlanByVariantId } from './plans.ts'

function createSubscriptionQuery(result) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => result),
  }

  return chain
}

function createPlanQuery(result) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  }

  return chain
}

describe('plans helpers', () => {
  it('returns the latest active subscription with a normalized plan payload', async () => {
    const subscriptionQuery = createSubscriptionQuery({
      data: [
        {
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
          metadata: null,
          plan: [{
            id: 'plan-1',
            code: 'business',
            name: 'Business',
            monthly_generation_limit: 30,
            monthly_edit_limit: 60,
            monthly_storage_limit_bytes: 1024,
            monthly_asset_upload_limit: 10,
            feature_flags: null,
          }],
        },
      ],
      error: null,
    })

    const adminClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => subscriptionQuery),
      })),
    }

    await expect(getActiveSubscriptionWithPlan(adminClient, 'user-1')).resolves.toEqual({
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
        monthly_edit_limit: 60,
        monthly_storage_limit_bytes: 1024,
        monthly_asset_upload_limit: 10,
        feature_flags: {},
      },
    })
  })

  it('throws a lookup error when the subscriptions query fails', async () => {
    const subscriptionQuery = createSubscriptionQuery({
      data: null,
      error: { message: 'boom' },
    })
    const adminClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => subscriptionQuery),
      })),
    }

    await expect(getActiveSubscriptionWithPlan(adminClient, 'user-1')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_LOOKUP_FAILED',
      status: 500,
    })
  })

  it('falls back to the free plan when no active subscription exists', async () => {
    const subscriptionQuery = createSubscriptionQuery({
      data: [],
      error: null,
    })
    const freePlanQuery = createPlanQuery({
      data: {
        id: 'plan-free',
        code: 'free',
        name: 'Free',
        monthly_generation_limit: 5,
        monthly_edit_limit: 10,
        monthly_storage_limit_bytes: 2048,
        monthly_asset_upload_limit: 10,
        feature_flags: {
          onboarding: true,
        },
      },
      error: null,
    })
    const adminClient = {
      from: vi.fn((table) => {
        if (table === 'subscriptions') {
          return {
            select: vi.fn(() => subscriptionQuery),
          }
        }

        if (table === 'plans') {
          return {
            select: vi.fn(() => freePlanQuery),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    await expect(getActiveSubscriptionWithPlan(adminClient, 'user-1')).resolves.toEqual({
      id: null,
      user_id: 'user-1',
      plan_id: 'plan-free',
      status: 'active',
      current_period_start: null,
      current_period_end: null,
      renewal_date: null,
      canceled_at: null,
      expired_at: null,
      cancel_at_period_end: false,
      metadata: {
        source: 'fallback_free_plan',
      },
      plan: {
        id: 'plan-free',
        code: 'free',
        name: 'Free',
        monthly_generation_limit: 5,
        monthly_edit_limit: 10,
        monthly_storage_limit_bytes: 2048,
        monthly_asset_upload_limit: 10,
        feature_flags: {
          onboarding: true,
        },
      },
    })

    expect(freePlanQuery.eq).toHaveBeenNthCalledWith(1, 'code', 'free')
    expect(freePlanQuery.eq).toHaveBeenNthCalledWith(2, 'is_active', true)
  })

  it('looks up an active plan by billing variant id', async () => {
    const planQuery = createPlanQuery({
      data: {
        id: 'plan-1',
        code: 'business',
        name: 'Business',
        lemon_squeezy_variant_id: 'variant-1',
      },
      error: null,
    })
    const adminClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => planQuery),
      })),
    }

    await expect(getPlanByVariantId(adminClient, 'variant-1')).resolves.toEqual({
      id: 'plan-1',
      code: 'business',
      name: 'Business',
      lemon_squeezy_variant_id: 'variant-1',
    })

    expect(planQuery.eq).toHaveBeenNthCalledWith(1, 'lemon_squeezy_variant_id', 'variant-1')
    expect(planQuery.eq).toHaveBeenNthCalledWith(2, 'is_active', true)
  })

  it('throws when the plan mapping lookup fails or finds nothing', async () => {
    const lookupFailureQuery = createPlanQuery({
      data: null,
      error: { message: 'db failure' },
    })
    const missingPlanQuery = createPlanQuery({
      data: null,
      error: null,
    })

    const adminClientWithFailure = {
      from: vi.fn(() => ({
        select: vi.fn(() => lookupFailureQuery),
      })),
    }
    const adminClientWithMissingPlan = {
      from: vi.fn(() => ({
        select: vi.fn(() => missingPlanQuery),
      })),
    }

    await expect(getPlanByVariantId(adminClientWithFailure, 'variant-1')).rejects.toMatchObject({
      code: 'PLAN_LOOKUP_FAILED',
      status: 500,
    })

    await expect(getPlanByVariantId(adminClientWithMissingPlan, 'variant-1')).rejects.toMatchObject({
      code: 'PLAN_MAPPING_NOT_FOUND',
      status: 400,
    })
  })
})
