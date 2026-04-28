import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8'
import { AppError } from './errors.ts'
import type { ActiveSubscription } from './plans.ts'

interface UsagePeriod {
  id: string
  user_id: string
  subscription_id: string | null
  period_start: string
  period_end: string
  generation_count: number
  edit_count: number
  asset_upload_count: number
  storage_bytes_used: number
}

function toUtcIsoString(date: Date) {
  return date.toISOString()
}

function getCurrentMonthWindow() {
  const now = new Date()
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0))

  return {
    periodStart,
    periodEnd,
  }
}

function getUsageWindow(subscription: ActiveSubscription) {
  if (subscription.current_period_start && subscription.current_period_end) {
    return {
      periodStart: new Date(subscription.current_period_start),
      periodEnd: new Date(subscription.current_period_end),
    }
  }

  return getCurrentMonthWindow()
}

export async function getOrCreateUsagePeriod(
  adminClient: SupabaseClient,
  userId: string,
  subscription: ActiveSubscription,
): Promise<UsagePeriod> {
  const { periodStart, periodEnd } = getUsageWindow(subscription)

  const { data, error } = await adminClient
    .from('usage_periods')
    .upsert(
      {
        user_id: userId,
        subscription_id: subscription.id,
        period_start: toUtcIsoString(periodStart),
        period_end: toUtcIsoString(periodEnd),
      },
      {
        onConflict: 'user_id,period_start,period_end',
      },
    )
    .select(`
      id,
        user_id,
        subscription_id,
        period_start,
        period_end,
        generation_count,
        edit_count,
        asset_upload_count,
        storage_bytes_used
    `)
    .single()

  if (error || !data) {
    throw new AppError('USAGE_PERIOD_ERROR', 'Failed to resolve usage period.', 500)
  }

  return data
}

export function assertGenerationAllowed(
  subscription: ActiveSubscription,
  usagePeriod: UsagePeriod,
) {
  const generationLimit = subscription.plan.monthly_generation_limit

  if (generationLimit <= 0) {
    throw new AppError(
      'PLAN_LIMIT_REACHED',
      'Your current plan does not allow post generations.',
      403,
    )
  }

  if (usagePeriod.generation_count >= generationLimit) {
    throw new AppError(
      'LIMIT_EXCEEDED',
      'Monthly generation limit reached.',
      403,
      {
        generation_limit: generationLimit,
        generation_count: usagePeriod.generation_count,
      },
    )
  }
}

export function assertEditAllowed(
  subscription: ActiveSubscription,
  usagePeriod: UsagePeriod,
) {
  const editLimit = subscription.plan.monthly_edit_limit

  if (editLimit <= 0) {
    throw new AppError(
      'PLAN_LIMIT_REACHED',
      'Your current plan does not allow post edits.',
      403,
    )
  }

  if (usagePeriod.edit_count >= editLimit) {
    throw new AppError(
      'LIMIT_EXCEEDED',
      'Monthly edit limit reached.',
      403,
      {
        edit_limit: editLimit,
        edit_count: usagePeriod.edit_count,
      },
    )
  }
}

export function assertAssetUploadAllowed(
  subscription: ActiveSubscription,
  usagePeriod: UsagePeriod,
) {
  const assetUploadLimit = subscription.plan.monthly_asset_upload_limit

  if (assetUploadLimit <= 0) {
    throw new AppError(
      'PLAN_LIMIT_REACHED',
      'Your current plan does not allow asset uploads.',
      403,
    )
  }

  if (usagePeriod.asset_upload_count >= assetUploadLimit) {
    throw new AppError(
      'LIMIT_EXCEEDED',
      'Monthly asset upload limit reached.',
      403,
      {
        asset_upload_limit: assetUploadLimit,
        asset_upload_count: usagePeriod.asset_upload_count,
      },
    )
  }
}

export function assertStorageAllowed(
  subscription: ActiveSubscription,
  usagePeriod: UsagePeriod,
  additionalStorageBytes: number,
) {
  const storageLimit = subscription.plan.monthly_storage_limit_bytes

  if (storageLimit <= 0) {
    throw new AppError(
      'PLAN_LIMIT_REACHED',
      'Your current plan does not allow file storage.',
      403,
    )
  }

  if (usagePeriod.storage_bytes_used + additionalStorageBytes > storageLimit) {
    throw new AppError(
      'LIMIT_EXCEEDED',
      'Monthly storage limit reached.',
      403,
      {
        storage_limit_bytes: storageLimit,
        storage_bytes_used: usagePeriod.storage_bytes_used,
        requested_storage_bytes: additionalStorageBytes,
      },
    )
  }
}

export async function recordUsageEvent(
  adminClient: SupabaseClient,
  params: {
    userId: string
    usagePeriodId: string
    eventType: 'generation' | 'edit' | 'storage_upload' | 'storage_delete' | 'manual_adjustment'
    resourceType?: string | null
    resourceId?: string | null
    quantity?: number
    storageBytesDelta?: number
    metadata?: Record<string, unknown>
  },
) {
  const { data, error } = await adminClient.rpc('record_usage_event', {
    p_user_id: params.userId,
    p_usage_period_id: params.usagePeriodId,
    p_event_type: params.eventType,
    p_resource_type: params.resourceType ?? null,
    p_resource_id: params.resourceId ?? null,
    p_quantity: params.quantity ?? 1,
    p_storage_bytes_delta: params.storageBytesDelta ?? 0,
    p_metadata: params.metadata ?? {},
  })

  if (error) {
    throw new AppError('USAGE_WRITE_FAILED', 'Failed to record usage.', 500)
  }

  return data
}
