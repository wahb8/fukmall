import { AppError } from '../_shared/errors.ts'
import { errorResponse, methodNotAllowed, ok, optionsResponse } from '../_shared/http.ts'
import {
  buildWebhookEventFingerprint,
  extractLemonWebhookContext,
  isSubscriptionEvent,
  normalizeSubscriptionStatus,
  parseLemonPayload,
  verifyLemonWebhookSignature,
} from '../_shared/lemon.ts'
import { getPlanById, getPlanByVariantId } from '../_shared/plans.ts'
import { createAdminClient } from '../_shared/supabase.ts'

function looksLikeUuid(value: string | null) {
  if (!value) {
    return false
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return optionsResponse()
  }

  if (request.method !== 'POST') {
    return methodNotAllowed(['POST'])
  }

  let eventRecordId: string | null = null
  const adminClient = createAdminClient()

  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-signature')

    if (!signature) {
      throw new AppError('UNAUTHORIZED', 'Missing webhook signature.', 401)
    }

    const validSignature = await verifyLemonWebhookSignature(rawBody, signature)

    if (!validSignature) {
      throw new AppError('UNAUTHORIZED', 'Invalid webhook signature.', 401)
    }

    const payload = parseLemonPayload(rawBody)
    const context = extractLemonWebhookContext(payload)
    const eventHash = await buildWebhookEventFingerprint(rawBody)

    const { data: existingEvent, error: existingEventError } = await adminClient
      .from('billing_webhook_events')
      .select('id, status, processing_attempts')
      .eq('event_hash', eventHash)
      .maybeSingle()

    if (existingEventError) {
      throw new AppError('WEBHOOK_LOOKUP_FAILED', 'Failed to inspect webhook history.', 500)
    }

    if (existingEvent?.status === 'processed' || existingEvent?.status === 'ignored') {
      return ok({
        duplicate: true,
        status: existingEvent.status,
      })
    }

    if (existingEvent) {
      eventRecordId = existingEvent.id

      const { error: touchEventError } = await adminClient
        .from('billing_webhook_events')
        .update({
          processing_attempts: (existingEvent.processing_attempts ?? 0) + 1,
          status: 'received',
          last_error: null,
        })
        .eq('id', existingEvent.id)

      if (touchEventError) {
        throw new AppError('WEBHOOK_UPDATE_FAILED', 'Failed to update webhook audit row.', 500)
      }
    } else {
      const { data: insertedEvent, error: insertEventError } = await adminClient
        .from('billing_webhook_events')
        .insert({
          provider: 'lemon_squeezy',
          event_name: context.eventName,
          event_hash: eventHash,
          provider_object_id: context.providerObjectId,
          status: 'received',
          processing_attempts: 1,
          payload,
        })
        .select('id')
        .single()

      if (insertEventError || !insertedEvent) {
        throw new AppError('WEBHOOK_AUDIT_CREATE_FAILED', 'Failed to persist webhook payload.', 500)
      }

      eventRecordId = insertedEvent.id
    }

    if (!isSubscriptionEvent(context.eventName)) {
      const { error: ignoreEventError } = await adminClient
        .from('billing_webhook_events')
        .update({
          status: 'ignored',
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventRecordId)

      if (ignoreEventError) {
        throw new AppError('WEBHOOK_UPDATE_FAILED', 'Failed to mark webhook event as ignored.', 500)
      }

      return ok({
        ignored: true,
        event_name: context.eventName,
      })
    }

    if (!context.providerSubscriptionId) {
      throw new AppError('INVALID_WEBHOOK_PAYLOAD', 'Subscription event is missing the subscription ID.', 400)
    }

    const { data: existingSubscription, error: existingSubscriptionError } = await adminClient
      .from('subscriptions')
      .select(`
        id,
        user_id,
        plan_id,
        current_period_start,
        current_period_end,
        renewal_date,
        canceled_at,
        expired_at
      `)
      .eq('lemon_squeezy_subscription_id', context.providerSubscriptionId)
      .maybeSingle()

    if (existingSubscriptionError) {
      throw new AppError('SUBSCRIPTION_LOOKUP_FAILED', 'Failed to inspect subscriptions.', 500)
    }

    const resolvedUserId = existingSubscription?.user_id ?? context.userId

    if (!looksLikeUuid(resolvedUserId)) {
      throw new AppError(
        'USER_MAPPING_REQUIRED',
        'Webhook event could not be mapped to an internal user.',
        400,
      )
    }

    const normalizedStatus = normalizeSubscriptionStatus(context.status, context.eventName)
    const plan = context.variantId
      ? await getPlanByVariantId(adminClient, context.variantId)
      : existingSubscription?.plan_id
        ? await getPlanById(adminClient, existingSubscription.plan_id)
        : null

    if (!plan) {
      throw new AppError(
        'PLAN_MAPPING_NOT_FOUND',
        'Subscription event could not be mapped to a local plan.',
        400,
      )
    }

    const syncedAt = new Date().toISOString()
    const renewalDate = context.renewsAt ?? existingSubscription?.renewal_date ?? null
    const currentPeriodEnd =
      context.renewsAt ??
      context.endsAt ??
      existingSubscription?.current_period_end ??
      existingSubscription?.renewal_date ??
      null
    const canceledAt = normalizedStatus === 'canceled'
      ? context.updatedAt ?? existingSubscription?.canceled_at ?? syncedAt
      : null
    const expiredAt = normalizedStatus === 'expired'
      ? context.endsAt ?? existingSubscription?.expired_at ?? syncedAt
      : null

    const upsertPayload: Record<string, unknown> = {
      user_id: resolvedUserId,
      plan_id: plan.id,
      status: normalizedStatus,
      lemon_squeezy_customer_id: context.customerId,
      lemon_squeezy_subscription_id: context.providerSubscriptionId,
      renewal_date: renewalDate,
      canceled_at: canceledAt,
      expired_at: expiredAt,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: normalizedStatus === 'canceled',
      metadata: {
        last_event_name: context.eventName,
        last_synced_at: syncedAt,
        payload,
      },
    }

    const currentPeriodStart =
      context.currentPeriodStart ?? existingSubscription?.current_period_start ?? null

    upsertPayload.current_period_start = currentPeriodStart

    const { error: upsertSubscriptionError } = await adminClient
      .from('subscriptions')
      .upsert(upsertPayload, {
        onConflict: 'lemon_squeezy_subscription_id',
      })

    if (upsertSubscriptionError) {
      throw new AppError('SUBSCRIPTION_SYNC_FAILED', 'Failed to sync subscription.', 500)
    }

    const { error: processedEventError } = await adminClient
      .from('billing_webhook_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', eventRecordId)

    if (processedEventError) {
      throw new AppError('WEBHOOK_UPDATE_FAILED', 'Failed to mark webhook event as processed.', 500)
    }

    return ok({
      processed: true,
      event_name: context.eventName,
      subscription_id: context.providerSubscriptionId,
      user_id: resolvedUserId,
      plan_code: plan.code,
    })
  } catch (error) {
    if (eventRecordId) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      const { error: failedEventError } = await adminClient
        .from('billing_webhook_events')
        .update({
          status: 'failed',
          last_error: message,
        })
        .eq('id', eventRecordId)

      if (failedEventError) {
        console.error('Failed to persist webhook failure state', failedEventError)
      }
    }

    return errorResponse(error)
  }
})
