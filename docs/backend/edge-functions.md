# Edge Functions

## Function Principles

Every function should:

- validate auth where required
- validate input shape before doing work
- check ownership and permissions
- return structured success and error responses
- avoid leaking internal details
- log important events

## Current Function Layer

The first server-side function layer now exists in scaffold form:

- shared auth, env, error, Supabase, Lemon, plan, and usage helpers in `supabase/functions/_shared/`
- `llm-generate-post`
- `lemon-webhook`
- `prepare-upload`
- `finalize-upload`
- `upsert-business-profile`

This is not the full backend yet. It is the first secure server boundary on top of the schema.

### `llm-generate-post`

Current behavior:

- verifies auth
- validates prompt, dimensions, and attachment IDs
- verifies chat ownership and optional business profile ownership
- verifies asset ownership for prompt attachments
- resolves the active subscription and current usage period
- enforces the monthly generation limit before expensive work starts
- creates a `chat_messages` row for the user request
- creates a `generation_jobs` row with `status = 'pending'`
- rolls back the request message if job creation fails, so intake does not leave orphaned history rows
- returns `202 Accepted`

Current limitation:

- it does not call OpenAI yet
- it is an intake/job-creation boundary, not the final generation pipeline

### `lemon-webhook`

Current behavior:

- accepts verified `POST` webhooks only
- verifies the Lemon Squeezy HMAC signature
- hashes the raw payload for deduplication
- writes or updates `billing_webhook_events`
- ignores non-subscription events safely
- maps the billing variant to a local `plans` row
- upserts local `subscriptions` state
- preserves `subscriptions.current_period_start` safely instead of relying on `undefined` payload fields

Current limitation:

- checkout creation and richer subscription reconciliation are still follow-up work

### `prepare-upload`

Current behavior:

- verifies auth
- validates upload asset kind, MIME type, file size, and optional chat ownership context
- resolves the effective plan and current usage period
- enforces asset-upload and storage limits before any object upload starts
- issues a signed upload token for a user-owned private Storage path

Current limitation:

- it only covers the onboarding and attachment upload path so far

### `finalize-upload`

Current behavior:

- verifies auth
- validates the signed-upload destination against the current user and asset kind
- loads Storage object metadata from the private bucket
- writes a trusted `uploaded_assets` row only after the object exists
- records the storage upload usage event
- removes the uploaded object again if metadata persistence or usage recording fails

Current limitation:

- richer cleanup flows for later asset deletion are still follow-up work

### `upsert-business-profile`

Current behavior:

- verifies auth
- validates business name, business type, tone preferences, brand colors, and referenced asset IDs
- verifies ownership and asset kind for the selected logo and reference images
- creates or updates the default `business_profiles` row
- links uploaded assets back to that business profile

Current limitation:

- this is the first onboarding/profile write surface, not the final full profile-management API

## Planned Next Functions

### `llm-edit-post`

Purpose:

- create a new version of an existing generated post from a follow-up prompt

Expected input:

- `chat_id`
- `generated_post_id`
- `prompt`
- optional `attachment_ids`

Expected behavior:

- verify auth
- verify ownership of the chat and generated post
- fetch the latest post version and bounded relevant context
- enforce edit limits
- call OpenAI
- write a new generated-post version
- update `generated_posts.current_version_id`
- append usage event(s)

### `lemon-webhook`

Purpose:

- verify and process Lemon Squeezy webhook events

Expected input:

- raw webhook request body
- Lemon webhook signature header

Expected behavior:

- verify signature
- deduplicate event
- persist raw payload for audit/debugging
- update local subscription state
- mark processing result

### `create-checkout`

Purpose:

- optionally create or prepare Lemon checkout sessions server-side

Expected input:

- requested plan code

Expected behavior:

- verify auth
- validate the requested plan against local allowed plans
- create a checkout link or signed handoff if needed
- never let the client choose arbitrary pricing identifiers

## Response Shape

Use consistent JSON responses:

Successful response pattern:

```json
{
  "ok": true,
  "data": {}
}
```

Error response pattern:

```json
{
  "ok": false,
  "error": {
    "code": "LIMIT_EXCEEDED",
    "message": "Monthly generation limit reached."
  }
}
```

## Shared Internal Helpers

Recommended shared helper areas:

- auth resolution
- typed error helpers
- usage enforcement
- plan lookup
- storage path generation
- OpenAI request builders
- webhook signature verification
