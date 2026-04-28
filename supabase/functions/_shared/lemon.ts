import { AppError } from './errors.ts'
import { getRequiredEnv } from './env.ts'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

function readPathString(
  source: Record<string, unknown> | null,
  path: string[],
): string | null {
  let current: unknown = source

  for (const segment of path) {
    const record = asRecord(current)

    if (!record || !(segment in record)) {
      return null
    }

    current = record[segment]
  }

  if (typeof current === 'string' && current.length > 0) {
    return current
  }

  if (typeof current === 'number' && Number.isFinite(current)) {
    return String(current)
  }

  return null
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false
  }

  let mismatch = 0

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return mismatch === 0
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return toHex(digest)
}

export async function verifyLemonWebhookSignature(rawBody: string, signature: string) {
  const secret = getRequiredEnv('LEMON_SQUEEZY_WEBHOOK_SECRET')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return timingSafeEqual(toHex(signed), signature)
}

export async function buildWebhookEventFingerprint(rawBody: string) {
  return sha256Hex(rawBody)
}

export function parseLemonPayload(rawBody: string) {
  try {
    return JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    throw new AppError('INVALID_WEBHOOK_PAYLOAD', 'Webhook payload is not valid JSON.', 400)
  }
}

export function extractLemonWebhookContext(payload: Record<string, unknown>) {
  const eventName = readPathString(payload, ['meta', 'event_name'])

  if (!eventName) {
    throw new AppError('INVALID_WEBHOOK_PAYLOAD', 'Webhook event name is missing.', 400)
  }

  return {
    eventName,
    providerObjectId: readPathString(payload, ['data', 'id']),
    providerSubscriptionId: readPathString(payload, ['data', 'id']),
    customerId: readPathString(payload, ['data', 'attributes', 'customer_id']),
    variantId:
      readPathString(payload, ['data', 'attributes', 'first_subscription_item', 'variant_id']) ??
      readPathString(payload, ['data', 'attributes', 'variant_id']),
    status: readPathString(payload, ['data', 'attributes', 'status']),
    currentPeriodStart:
      readPathString(payload, ['data', 'attributes', 'current_period_start']) ??
      readPathString(payload, ['data', 'attributes', 'starts_at']),
    renewsAt: readPathString(payload, ['data', 'attributes', 'renews_at']),
    endsAt: readPathString(payload, ['data', 'attributes', 'ends_at']),
    updatedAt: readPathString(payload, ['data', 'attributes', 'updated_at']),
    userId: readPathString(payload, ['meta', 'custom_data', 'user_id']),
    payload,
  }
}

export function isSubscriptionEvent(eventName: string) {
  return eventName.startsWith('subscription_')
}

export function normalizeSubscriptionStatus(
  rawStatus: string | null,
  eventName: string,
) {
  if (rawStatus && ['trialing', 'active', 'canceled', 'expired', 'past_due'].includes(rawStatus)) {
    return rawStatus
  }

  if (eventName === 'subscription_cancelled') {
    return 'canceled'
  }

  if (eventName === 'subscription_expired') {
    return 'expired'
  }

  if (eventName === 'subscription_payment_failed') {
    return 'past_due'
  }

  return 'active'
}
