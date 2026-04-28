import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('lemon helpers', () => {
  const originalDeno = globalThis.Deno

  beforeEach(() => {
    globalThis.Deno = {
      env: {
        get: vi.fn((name) => (name === 'LEMON_SQUEEZY_WEBHOOK_SECRET' ? 'super-secret' : undefined)),
      },
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.Deno = originalDeno
  })

  it('parses Lemon payload JSON', async () => {
    const { parseLemonPayload } = await import('./lemon.ts')

    expect(parseLemonPayload('{"meta":{"event_name":"subscription_created"}}')).toEqual({
      meta: { event_name: 'subscription_created' },
    })
  })

  it('throws for invalid Lemon payload JSON', async () => {
    const { parseLemonPayload } = await import('./lemon.ts')

    expect(() => parseLemonPayload('oops')).toThrowError('Webhook payload is not valid JSON.')
  })

  it('extracts normalized webhook context including numeric ids and current period start fallbacks', async () => {
    const { extractLemonWebhookContext } = await import('./lemon.ts')

    const context = extractLemonWebhookContext({
      meta: {
        event_name: 'subscription_updated',
        custom_data: {
          user_id: '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
        },
      },
      data: {
        id: 12345,
        attributes: {
          customer_id: 67890,
          first_subscription_item: {
            variant_id: 9001,
          },
          status: 'active',
          starts_at: '2026-04-01T00:00:00.000Z',
          renews_at: '2026-05-01T00:00:00.000Z',
          ends_at: null,
          updated_at: '2026-04-28T00:00:00.000Z',
        },
      },
    })

    expect(context).toMatchObject({
      eventName: 'subscription_updated',
      providerObjectId: '12345',
      providerSubscriptionId: '12345',
      customerId: '67890',
      variantId: '9001',
      status: 'active',
      currentPeriodStart: '2026-04-01T00:00:00.000Z',
      renewsAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-04-28T00:00:00.000Z',
      userId: '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
    })
  })

  it('throws when the webhook event name is missing', async () => {
    const { extractLemonWebhookContext } = await import('./lemon.ts')

    expect(() => extractLemonWebhookContext({ data: {} })).toThrowError(
      'Webhook event name is missing.',
    )
  })

  it('detects subscription events', async () => {
    const { isSubscriptionEvent } = await import('./lemon.ts')

    expect(isSubscriptionEvent('subscription_created')).toBe(true)
    expect(isSubscriptionEvent('order_created')).toBe(false)
  })

  it('normalizes subscription statuses from raw status or event names', async () => {
    const { normalizeSubscriptionStatus } = await import('./lemon.ts')

    expect(normalizeSubscriptionStatus('trialing', 'subscription_created')).toBe('trialing')
    expect(normalizeSubscriptionStatus(null, 'subscription_cancelled')).toBe('canceled')
    expect(normalizeSubscriptionStatus(null, 'subscription_expired')).toBe('expired')
    expect(normalizeSubscriptionStatus(null, 'subscription_payment_failed')).toBe('past_due')
    expect(normalizeSubscriptionStatus(null, 'subscription_created')).toBe('active')
  })

  it('verifies webhook signatures using the configured secret', async () => {
    const {
      buildWebhookEventFingerprint,
      verifyLemonWebhookSignature,
    } = await import('./lemon.ts')

    const rawBody = JSON.stringify({
      meta: {
        event_name: 'subscription_created',
      },
    })
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode('super-secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
    const validSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')

    await expect(verifyLemonWebhookSignature(rawBody, validSignature)).resolves.toBe(true)
    await expect(verifyLemonWebhookSignature(rawBody, `${validSignature}00`)).resolves.toBe(false)
    await expect(buildWebhookEventFingerprint(rawBody)).resolves.toHaveLength(64)
  })
})
