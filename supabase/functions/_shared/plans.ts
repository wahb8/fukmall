import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8'
import { AppError } from './errors.ts'

export interface ActivePlan {
  id: string
  code: string
  name: string
  monthly_generation_limit: number
  monthly_edit_limit: number
  monthly_storage_limit_bytes: number
  monthly_asset_upload_limit: number
  feature_flags: Record<string, unknown>
}

export interface ActiveSubscription {
  id: string | null
  user_id: string
  plan_id: string
  status: string
  current_period_start: string | null
  current_period_end: string | null
  renewal_date: string | null
  canceled_at: string | null
  expired_at: string | null
  cancel_at_period_end: boolean
  metadata: Record<string, unknown>
  plan: ActivePlan
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function getAccessWindowEnd(subscription: {
  current_period_end: string | null
  renewal_date: string | null
}) {
  return parseTimestamp(subscription.current_period_end) ?? parseTimestamp(subscription.renewal_date)
}

function getSubscriptionAccessRank(
  subscription: {
    status: string
    current_period_end: string | null
    renewal_date: string | null
  },
  now = Date.now(),
) {
  if (subscription.status === 'active') {
    return 4
  }

  if (subscription.status === 'trialing') {
    return 3
  }

  if (subscription.status === 'past_due') {
    return 2
  }

  if (subscription.status === 'canceled') {
    const accessWindowEnd = getAccessWindowEnd(subscription)

    if (accessWindowEnd && accessWindowEnd > now) {
      return 1
    }
  }

  return 0
}

async function getFallbackFreePlan(
  adminClient: SupabaseClient,
  userId: string,
): Promise<ActiveSubscription> {
  const { data, error } = await adminClient
    .from('plans')
    .select(`
      id,
      code,
      name,
      monthly_generation_limit,
      monthly_edit_limit,
      monthly_storage_limit_bytes,
      monthly_asset_upload_limit,
      feature_flags
    `)
    .eq('code', 'free')
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw new AppError('PLAN_LOOKUP_FAILED', 'Failed to load the fallback free plan.', 500)
  }

  if (!data) {
    throw new AppError(
      'SUBSCRIPTION_REQUIRED',
      'An active subscription or fallback free plan is required for this action.',
      403,
    )
  }

  return {
    id: null,
    user_id: userId,
    plan_id: data.id,
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
      id: data.id,
      code: data.code,
      name: data.name,
      monthly_generation_limit: data.monthly_generation_limit,
      monthly_edit_limit: data.monthly_edit_limit,
      monthly_storage_limit_bytes: data.monthly_storage_limit_bytes,
      monthly_asset_upload_limit: data.monthly_asset_upload_limit,
      feature_flags: data.feature_flags ?? {},
    },
  }
}

export async function getActiveSubscriptionWithPlan(
  adminClient: SupabaseClient,
  userId: string,
): Promise<ActiveSubscription> {
  const { data, error } = await adminClient
    .from('subscriptions')
    .select(`
      id,
      user_id,
      plan_id,
      status,
      current_period_start,
      current_period_end,
      renewal_date,
      canceled_at,
      expired_at,
      cancel_at_period_end,
      updated_at,
      metadata,
      plan:plans (
        id,
        code,
        name,
        monthly_generation_limit,
        monthly_edit_limit,
        monthly_storage_limit_bytes,
        monthly_asset_upload_limit,
        feature_flags
      )
    `)
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'past_due', 'canceled'])
    .order('updated_at', { ascending: false })
    .limit(10)

  if (error) {
    throw new AppError('SUBSCRIPTION_LOOKUP_FAILED', 'Failed to load subscription.', 500)
  }

  const rankedRows = (data ?? [])
    .map((row) => ({
      row,
      plan: Array.isArray(row?.plan) ? row.plan[0] : row?.plan,
      rank: getSubscriptionAccessRank(row),
      accessWindowEnd: getAccessWindowEnd(row),
      updatedAt: parseTimestamp(row?.updated_at),
    }))
    .filter((entry) => entry.row && entry.plan && entry.rank > 0)
    .sort((left, right) => {
      if (right.rank !== left.rank) {
        return right.rank - left.rank
      }

      if ((right.accessWindowEnd ?? 0) !== (left.accessWindowEnd ?? 0)) {
        return (right.accessWindowEnd ?? 0) - (left.accessWindowEnd ?? 0)
      }

      return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
    })

  const selectedEntry = rankedRows[0]
  const row = selectedEntry?.row
  const plan = selectedEntry?.plan

  if (!row || !plan) {
    return getFallbackFreePlan(adminClient, userId)
  }

  return {
    id: row.id,
    user_id: row.user_id,
    plan_id: row.plan_id,
    status: row.status,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    renewal_date: row.renewal_date,
    canceled_at: row.canceled_at,
    expired_at: row.expired_at,
    cancel_at_period_end: row.cancel_at_period_end,
    metadata: row.metadata ?? {},
    plan: {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      monthly_generation_limit: plan.monthly_generation_limit,
      monthly_edit_limit: plan.monthly_edit_limit,
      monthly_storage_limit_bytes: plan.monthly_storage_limit_bytes,
      monthly_asset_upload_limit: plan.monthly_asset_upload_limit,
      feature_flags: plan.feature_flags ?? {},
    },
  }
}

export async function getPlanByVariantId(
  adminClient: SupabaseClient,
  variantId: string,
) {
  const { data, error } = await adminClient
    .from('plans')
    .select('id, code, name, lemon_squeezy_variant_id')
    .eq('lemon_squeezy_variant_id', variantId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw new AppError('PLAN_LOOKUP_FAILED', 'Failed to load plan mapping.', 500)
  }

  if (!data) {
    throw new AppError('PLAN_MAPPING_NOT_FOUND', 'No plan is mapped to that billing variant.', 400)
  }

  return data
}

export async function getPlanById(
  adminClient: SupabaseClient,
  planId: string,
) {
  const { data, error } = await adminClient
    .from('plans')
    .select('id, code, name')
    .eq('id', planId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw new AppError('PLAN_LOOKUP_FAILED', 'Failed to load plan.', 500)
  }

  if (!data) {
    throw new AppError('PLAN_MAPPING_NOT_FOUND', 'No active plan exists for that billing record.', 400)
  }

  return data
}
