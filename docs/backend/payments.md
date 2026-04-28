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
- deduplicate events by provider event ID
- keep handlers idempotent
- update local subscription state only after verified events

## Local Subscription Model

The local database should keep:

- the current subscription snapshot
- the mapped local plan/tier
- the current status
- relevant renewal or end dates

Feature access should key off the local synced subscription row, not off direct frontend claims.

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
