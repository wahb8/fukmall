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
- `generate-post`
- `generation-job-status`
- `cancel-generation-job`
- `llm-generate-post`
- `lemon-webhook`
- `prepare-upload`
- `finalize-upload`
- `upsert-business-profile`

This is not the full backend yet. It is the first secure server boundary on top of the schema.

### `generate-post`

Current behavior:

- verifies auth
- validates prompt, dimensions, chat ID, optional business profile ID, and attachment IDs
- verifies chat ownership and active chat status
- loads the user's default or chat-linked business profile from the database
- loads user-owned prompt attachments and brand reference images
- treats the first prompt in a chat as initial generation and later prompts as edits
- enforces generation or edit limits before calling OpenAI
- builds hidden image and caption prompts through shared prompt-template helpers
- creates a `generation_jobs` row and returns `202 Accepted` so the browser can poll instead of
  waiting on one long image-generation request
- schedules best-effort automatic chat title generation with a small text model on the first prompt
  when the chat still has a default title such as `Untitled`, without blocking or failing post
  generation
- calls OpenAI from the Edge Function background task only, with image and caption generation
  running in parallel
- uses `gpt-image-2` as the default image generation model unless
  `OPENAI_IMAGE_MODEL` overrides it
- sends GPT Image model requests through the direct Images API, using image edits when reference
  images are attached
- stores generated image output in the private `generated-posts` bucket
- stores caption text and generated-post metadata in `generated_posts`
- appends assistant result or error messages to `chat_messages`
- records storage and generation/edit usage only after successful output persistence
- updates `generation_jobs` through `pending`, `processing`, `completed`, `failed`, or `canceled`
- checks for user cancellation before persisting generated output so stopped jobs do not write a
  post back into the chat after the frontend has interrupted generation
- cancels older pending/processing jobs in the same chat when a newer generation starts, and only
  lets the latest job for that chat persist output
- completes a job only if it is still `processing`; if the user canceled it before completion, the
  function rolls back the generated post, assistant message, and stored image instead of reviving
  the job as `completed`
- keeps fallback reference images deferred for now; when a profile has no reference images, the
  function proceeds from written brand context and marks the fallback metadata as deferred

Current limitation:

- fallback reference asset sets by business type are intentionally not implemented yet
- background generation currently uses the Edge Runtime background-task lifecycle, not a durable
  external queue

### `generation-job-status`

Current behavior:

- verifies auth
- validates the generation job ID
- loads only the current user's matching `generation_jobs` row
- returns the current job status and the matching assistant result/error message after completion
  or failure
- lets the frontend poll `pending`, `processing`, `completed`, and `failed` states without holding
  the original request open
- reports `canceled` jobs as terminal so the frontend can stop polling cleanly

Current limitation:

- it is a polling endpoint only; server push or realtime updates can be added later if needed

### `cancel-generation-job`

Current behavior:

- verifies auth
- validates the generation job ID
- loads only the current user's matching `generation_jobs` row
- updates `pending` or `processing` jobs to `canceled`
- leaves already terminal jobs unchanged
- returns the current terminal job state if the job finishes between lookup and the cancel update,
  instead of treating that race as a server error

Purpose:

- lets the frontend stop polling and mark an active generation as interrupted without trusting a
  client-side-only state change

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
- the frontend now calls `generate-post` for the real MVP generation path

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
- normalizes Lemon statuses like `on_trial`, `cancelled`, `paused`, and `unpaid` into the
  app-level subscription model
- preserves access for `canceled` subscriptions until the paid-through date ends
- falls back to the existing synced local plan if a subscription follow-up event omits a variant ID
- preserves the existing local billing dates if a sparse follow-up event omits renewal or end-date
  fields

Current limitation:

- checkout creation and richer subscription reconciliation are still follow-up work

### `prepare-upload`

Current behavior:

- verifies auth
- validates upload asset kind, normalized MIME type, file size, and optional chat ownership context
- accepts supported image files even when the browser reports a known image alias or generic
  `application/octet-stream` MIME type for a valid image extension
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
- normalizes the stored object MIME type against the original file name before validating it
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
- deletes removed brand reference images and logos from private Storage and removes their
  `uploaded_assets` metadata rows, instead of leaving stale unlinked profile assets behind
- also cleans stale unlinked brand-reference and logo assets for the same user while preserving
  assets included in the current save request
- stale asset cleanup is best-effort and does not block saving/linking the current profile assets
  if a stale Storage object, cleanup lookup, metadata delete, or usage rollback fails

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
