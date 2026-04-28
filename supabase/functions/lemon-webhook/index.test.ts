import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const verifyLemonWebhookSignatureMock = vi.fn()
const parseLemonPayloadMock = vi.fn()
const extractLemonWebhookContextMock = vi.fn()
const buildWebhookEventFingerprintMock = vi.fn()
const isSubscriptionEventMock = vi.fn()
const normalizeSubscriptionStatusMock = vi.fn()
const getPlanByVariantIdMock = vi.fn()
const getPlanByIdMock = vi.fn()
const createAdminClientMock = vi.fn()

vi.mock('../_shared/lemon.ts', () => ({
  verifyLemonWebhookSignature: verifyLemonWebhookSignatureMock,
  parseLemonPayload: parseLemonPayloadMock,
  extractLemonWebhookContext: extractLemonWebhookContextMock,
  buildWebhookEventFingerprint: buildWebhookEventFingerprintMock,
  isSubscriptionEvent: isSubscriptionEventMock,
  normalizeSubscriptionStatus: normalizeSubscriptionStatusMock,
}))

vi.mock('../_shared/plans.ts', () => ({
  getPlanByVariantId: getPlanByVariantIdMock,
  getPlanById: getPlanByIdMock,
}))

vi.mock('../_shared/supabase.ts', () => ({
  createAdminClient: createAdminClientMock,
}))

function createMaybeSingleQuery(result) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  }

  return chain
}

function createUpdateTable() {
  const eq = vi.fn(async () => ({
    error: null,
  }))

  return {
    payloads: [],
    update: vi.fn((payload) => {
      createUpdateTable.payloads?.push?.(payload)
      return {
        eq,
      }
    }),
    eq,
  }
}

async function loadHandler() {
  vi.resetModules()

  let capturedHandler = null
  globalThis.Deno = {
    serve: vi.fn((handler) => {
      capturedHandler = handler
    }),
  }

  await import('./index.ts')

  return capturedHandler
}

describe('lemon-webhook edge function', () => {
  beforeEach(() => {
    verifyLemonWebhookSignatureMock.mockReset()
    parseLemonPayloadMock.mockReset()
    extractLemonWebhookContextMock.mockReset()
    buildWebhookEventFingerprintMock.mockReset()
    isSubscriptionEventMock.mockReset()
    normalizeSubscriptionStatusMock.mockReset()
    getPlanByVariantIdMock.mockReset()
    getPlanByIdMock.mockReset()
    createAdminClientMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 405 for unsupported methods', async () => {
    const handler = await loadHandler()

    const response = await handler(new Request('https://example.com', {
      method: 'GET',
    }))

    expect(response.status).toBe(405)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
      },
    })
  })

  it('short-circuits duplicate processed events', async () => {
    const billingEventsQuery = createMaybeSingleQuery({
      data: {
        id: 'event-1',
        status: 'processed',
        processing_attempts: 1,
      },
      error: null,
    })

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'billing_webhook_events') {
          return {
            select: vi.fn(() => billingEventsQuery),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })
    verifyLemonWebhookSignatureMock.mockResolvedValue(true)
    parseLemonPayloadMock.mockReturnValue({ payload: true })
    extractLemonWebhookContextMock.mockReturnValue({
      eventName: 'subscription_created',
    })
    buildWebhookEventFingerprintMock.mockResolvedValue('hash-1')

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      headers: {
        'x-signature': 'signature',
      },
      body: '{}',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        duplicate: true,
        status: 'processed',
      },
    })
  })

  it('processes a subscription webhook and preserves current_period_start', async () => {
    const billingEventInsertPayloads = []
    const billingEventUpdatePayloads = []
    const subscriptionUpsertPayloads = []
    const billingEventsQuery = createMaybeSingleQuery({
      data: null,
      error: null,
    })
    const subscriptionsQuery = createMaybeSingleQuery({
      data: {
        id: 'sub-row-1',
        user_id: '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
        current_period_start: '2026-04-01T00:00:00.000Z',
      },
      error: null,
    })
    const billingEventsTable = {
      select: vi.fn(() => billingEventsQuery),
      insert: vi.fn((payload) => {
        billingEventInsertPayloads.push(payload)

        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'event-1',
              },
              error: null,
            })),
          })),
        }
      }),
      update: vi.fn((payload) => {
        billingEventUpdatePayloads.push(payload)

        return {
          eq: vi.fn(async () => ({
            error: null,
          })),
        }
      }),
    }
    const subscriptionsTable = {
      select: vi.fn(() => subscriptionsQuery),
      upsert: vi.fn(async (payload, options) => {
        subscriptionUpsertPayloads.push({ payload, options })

        return {
          error: null,
        }
      }),
    }

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'billing_webhook_events') {
          return billingEventsTable
        }

        if (table === 'subscriptions') {
          return subscriptionsTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })
    verifyLemonWebhookSignatureMock.mockResolvedValue(true)
    parseLemonPayloadMock.mockReturnValue({ payload: true })
    extractLemonWebhookContextMock.mockReturnValue({
      eventName: 'subscription_updated',
      providerObjectId: 'provider-object-1',
      providerSubscriptionId: 'provider-subscription-1',
      customerId: 'customer-1',
      variantId: 'variant-1',
      status: 'active',
      currentPeriodStart: null,
      renewsAt: '2026-05-01T00:00:00.000Z',
      endsAt: null,
      updatedAt: '2026-04-28T00:00:00.000Z',
      userId: '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
    })
    buildWebhookEventFingerprintMock.mockResolvedValue('hash-1')
    isSubscriptionEventMock.mockReturnValue(true)
    normalizeSubscriptionStatusMock.mockReturnValue('active')
    getPlanByVariantIdMock.mockResolvedValue({
      id: 'plan-1',
      code: 'business',
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      headers: {
        'x-signature': 'signature',
      },
      body: '{}',
    }))

    expect(response.status).toBe(200)
    expect(billingEventInsertPayloads[0]).toMatchObject({
      provider: 'lemon_squeezy',
      event_name: 'subscription_updated',
      event_hash: 'hash-1',
    })
    expect(subscriptionUpsertPayloads[0]).toEqual({
      payload: expect.objectContaining({
        user_id: '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
        plan_id: 'plan-1',
        lemon_squeezy_subscription_id: 'provider-subscription-1',
        current_period_start: '2026-04-01T00:00:00.000Z',
        current_period_end: '2026-05-01T00:00:00.000Z',
      }),
      options: {
        onConflict: 'lemon_squeezy_subscription_id',
      },
    })
    expect(billingEventUpdatePayloads.at(-1)).toMatchObject({
      status: 'processed',
      last_error: null,
    })

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        processed: true,
        event_name: 'subscription_updated',
        subscription_id: 'provider-subscription-1',
        user_id: '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
        plan_code: 'business',
      },
    })
  })

  it('falls back to the existing local plan when a follow-up webhook omits the variant id', async () => {
    const subscriptionUpsertPayloads = []
    const billingEventsQuery = createMaybeSingleQuery({
      data: null,
      error: null,
    })
    const subscriptionsQuery = createMaybeSingleQuery({
      data: {
        id: 'sub-row-1',
        user_id: '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
        plan_id: 'plan-1',
        current_period_start: '2026-04-01T00:00:00.000Z',
      },
      error: null,
    })
    const billingEventsTable = {
      select: vi.fn(() => billingEventsQuery),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              id: 'event-1',
            },
            error: null,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({
          error: null,
        })),
      })),
    }
    const subscriptionsTable = {
      select: vi.fn(() => subscriptionsQuery),
      upsert: vi.fn(async (payload) => {
        subscriptionUpsertPayloads.push(payload)

        return {
          error: null,
        }
      }),
    }

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'billing_webhook_events') {
          return billingEventsTable
        }

        if (table === 'subscriptions') {
          return subscriptionsTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })
    verifyLemonWebhookSignatureMock.mockResolvedValue(true)
    parseLemonPayloadMock.mockReturnValue({ payload: true })
    extractLemonWebhookContextMock.mockReturnValue({
      eventName: 'subscription_cancelled',
      providerObjectId: 'provider-object-1',
      providerSubscriptionId: 'provider-subscription-1',
      customerId: 'customer-1',
      variantId: null,
      status: null,
      currentPeriodStart: null,
      renewsAt: null,
      endsAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-04-28T00:00:00.000Z',
      userId: null,
    })
    buildWebhookEventFingerprintMock.mockResolvedValue('hash-1')
    isSubscriptionEventMock.mockReturnValue(true)
    normalizeSubscriptionStatusMock.mockReturnValue('canceled')
    getPlanByVariantIdMock.mockRejectedValue(new Error('variant lookup should not run'))
    getPlanByIdMock.mockResolvedValue({
      id: 'plan-1',
      code: 'business',
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      headers: {
        'x-signature': 'signature',
      },
      body: '{}',
    }))

    expect(response.status).toBe(200)
    expect(getPlanByIdMock).toHaveBeenCalledWith(expect.anything(), 'plan-1')
    expect(subscriptionUpsertPayloads[0]).toMatchObject({
      user_id: '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
      plan_id: 'plan-1',
      status: 'canceled',
      current_period_start: '2026-04-01T00:00:00.000Z',
      current_period_end: '2026-05-01T00:00:00.000Z',
      cancel_at_period_end: true,
    })
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        processed: true,
        plan_code: 'business',
      },
    })
  })

  it('preserves the existing paid-through window when a cancellation webhook omits date fields', async () => {
    const subscriptionUpsertPayloads = []
    const billingEventsQuery = createMaybeSingleQuery({
      data: null,
      error: null,
    })
    const subscriptionsQuery = createMaybeSingleQuery({
      data: {
        id: 'sub-row-1',
        user_id: '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
        plan_id: 'plan-1',
        current_period_start: '2026-04-01T00:00:00.000Z',
        current_period_end: '2026-05-01T00:00:00.000Z',
        renewal_date: '2026-05-01T00:00:00.000Z',
        canceled_at: '2026-04-20T00:00:00.000Z',
        expired_at: null,
      },
      error: null,
    })
    const billingEventsTable = {
      select: vi.fn(() => billingEventsQuery),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              id: 'event-1',
            },
            error: null,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({
          error: null,
        })),
      })),
    }
    const subscriptionsTable = {
      select: vi.fn(() => subscriptionsQuery),
      upsert: vi.fn(async (payload) => {
        subscriptionUpsertPayloads.push(payload)

        return {
          error: null,
        }
      }),
    }

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'billing_webhook_events') {
          return billingEventsTable
        }

        if (table === 'subscriptions') {
          return subscriptionsTable
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })
    verifyLemonWebhookSignatureMock.mockResolvedValue(true)
    parseLemonPayloadMock.mockReturnValue({ payload: true })
    extractLemonWebhookContextMock.mockReturnValue({
      eventName: 'subscription_cancelled',
      providerObjectId: 'provider-object-1',
      providerSubscriptionId: 'provider-subscription-1',
      customerId: 'customer-1',
      variantId: null,
      status: null,
      currentPeriodStart: null,
      renewsAt: null,
      endsAt: null,
      updatedAt: null,
      userId: null,
    })
    buildWebhookEventFingerprintMock.mockResolvedValue('hash-1')
    isSubscriptionEventMock.mockReturnValue(true)
    normalizeSubscriptionStatusMock.mockReturnValue('canceled')
    getPlanByIdMock.mockResolvedValue({
      id: 'plan-1',
      code: 'business',
    })

    const handler = await loadHandler()
    const response = await handler(new Request('https://example.com', {
      method: 'POST',
      headers: {
        'x-signature': 'signature',
      },
      body: '{}',
    }))

    expect(response.status).toBe(200)
    expect(subscriptionUpsertPayloads[0]).toMatchObject({
      user_id: '1fb64d91-7468-4c1e-827a-7a4bb93343fb',
      plan_id: 'plan-1',
      status: 'canceled',
      current_period_start: '2026-04-01T00:00:00.000Z',
      current_period_end: '2026-05-01T00:00:00.000Z',
      renewal_date: '2026-05-01T00:00:00.000Z',
      canceled_at: '2026-04-20T00:00:00.000Z',
      cancel_at_period_end: true,
    })
  })
})
