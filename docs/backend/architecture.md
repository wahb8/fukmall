# Backend Architecture

## System Shape

The backend is organized into six responsibility areas:

1. authentication and identity
2. relational data model
3. file storage
4. AI generation pipeline
5. billing and subscription state
6. usage accounting and feature enforcement

These concerns should remain separate in both code and documentation.

## Services

### Supabase Auth

Owns:

- email/password sign-up and sign-in
- password reset flow
- Google OAuth sign-in
- authenticated user identity

Does not own:

- subscription truth
- AI generation permissions by itself
- business profile completeness

### Supabase Postgres

Owns:

- profiles
- onboarding context
- chats and messages
- generated post records and versions
- asset metadata
- subscription snapshots
- usage counters and usage events
- audit-friendly event records where needed

Does not store:

- large binary uploads
- OpenAI API keys
- Lemon Squeezy secrets

### Supabase Storage

Owns uploaded files and generated files:

- onboarding reference images
- user prompt attachments
- generated post images
- optional exported files

Postgres stores only metadata and storage paths.

### Supabase Edge Functions

Owns all privileged backend logic:

- AI generation calls
- AI edit/regeneration calls
- Lemon Squeezy webhook handling
- usage enforcement before expensive operations
- signed server-side workflows that require service-role access

No OpenAI or service-role credentials may ever be exposed to the client.

### OpenAI API

Used only through Edge Functions for:

- image generation or editing
- caption generation
- structured content refinement

The client never calls OpenAI directly.

### Lemon Squeezy

Owns external billing events.

The webhook stream is the source of truth for:

- subscription creation
- subscription activation
- subscription change
- renewal
- cancellation
- expiration

The frontend can initiate checkout, but it is not trusted as confirmation of payment state.

## Recommended Backend Code Layout

When implementation starts, keep the Supabase backend modular:

- `supabase/migrations/`: schema, indexes, constraints, triggers, RLS policies
- `supabase/functions/_shared/`: shared validation, auth helpers, AI helpers, billing helpers
- `supabase/functions/create-checkout/`: checkout session creation if needed
- `supabase/functions/generate-post/`: current MVP generation and edit pipeline
- `supabase/functions/llm-generate-post/`: older intake scaffold retained for now
- `supabase/functions/llm-edit-post/`: follow-up edit pipeline
- `supabase/functions/lemon-webhook/`: webhook verification and subscription sync
- `supabase/functions/upload-prepare/`: optional upload validation/signing helpers if needed

Shared helpers should centralize:

- env validation
- authenticated user resolution
- tier and limit checks
- storage path conventions
- structured error responses
- OpenAI request construction

## High-Level Request Flows

### Sign-Up And Onboarding

1. user signs up through Supabase Auth
2. backend creates a matching profile row
3. user selects a plan and begins checkout
4. Lemon webhook updates subscription state
5. user completes onboarding data such as business type and reference assets

### First Generation

1. client sends prompt + dimensions + optional attachment references
2. Edge Function verifies auth
3. Edge Function verifies subscription and usage limits
4. Edge Function fetches profile, onboarding context, and relevant recent chat context
5. Edge Function builds structured OpenAI request(s)
6. Edge Function stores result metadata and generated outputs
7. Edge Function returns a structured response for the frontend editor

### Prompt-Based Edit

1. client references an existing chat and generated post
2. Edge Function verifies ownership of both
3. Edge Function fetches the latest editable version and relevant edit context
4. Edge Function generates a new version rather than mutating history in place
5. usage is recorded
6. response returns the new version metadata

### Subscription Update

1. Lemon Squeezy emits a webhook
2. webhook signature is verified
3. event is deduplicated if already processed
4. backend updates local subscription snapshot
5. tier/entitlement state is recalculated

## Design Constraints

- chats, posts, assets, and subscriptions are user-owned and must be protected by RLS
- generated post history should be append-oriented to support versioning and audits
- AI requests should be bounded and context-aware, not based on dumping entire history
- usage enforcement must happen before expensive AI calls
- webhook handling should be idempotent and safe to retry
