# Payments And Subscriptions

## Provider Choice

Lemon Squeezy is the recommended billing provider for this app's current scope.

It is a good fit because:

- the app has simple tiered subscriptions
- checkout and recurring billing can be externalized
- webhook-driven subscription sync is straightforward

## Source Of Truth

Lemon Squeezy webhooks are the only trusted source of subscription state.

The frontend may:

- start checkout
- show pending UI
- refresh account status

The frontend may not:

- mark a subscription as active
- grant features directly
- bypass usage checks based on optimistic payment state

## Required Webhook Handling Rules

- verify webhook signatures before processing
- store raw payloads for audit/debugging
- deduplicate events reliably before reprocessing
- keep handlers idempotent
- update local subscription state only after verified events

Current implementation detail:

- the webhook audit table is `billing_webhook_events`
- the current dedupe key is `event_hash`, a SHA-256 hash of the raw webhook body
- non-subscription events can be marked `ignored` instead of forcing subscription updates
- if a follow-up subscription webhook omits the Lemon variant ID, the handler reuses the already
  synced local `plan_id` instead of failing the event unnecessarily
- if a follow-up subscription webhook omits renewal or end-date fields, the handler preserves the
  already synced local paid-through window instead of clearing it

## Local Subscription Model

The local database should keep:

- the current subscription snapshot
- the mapped local plan/tier
- the current status
- relevant renewal or end dates

Feature access should key off the local synced subscription row, not off direct frontend claims.

Current local status normalization:

- `on_trial` -> `trialing`
- `active` -> `active`
- `cancelled` / `canceled` -> `canceled`
- `paused` / `unpaid` / payment-failure states -> `past_due`
- `expired` -> `expired`

Cancellation access rule:

- a `canceled` subscription keeps access until `current_period_end` or `renewal_date`
- after that window ends, the app falls back to the free plan or the next valid active
  subscription row

## Plan Mapping

Keep plan logic simple:

- `free`
- `business`
- `enterprise`

Each plan should map to:

- usage limits
- enabled features
- storage expectations

Keep these limits in a centralized table or config layer rather than scattering them through
functions.

## Failure Handling

If webhook processing fails:

- persist the failed event
- mark failure details internally
- allow safe retry processing

Do not expose sensitive provider payload details to the client.
