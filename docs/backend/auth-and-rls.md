# Authentication And Authorization

## Authentication

Use Supabase Auth for:

- email/password sign-up
- email/password sign-in
- password reset
- Google sign-in

All backend functions should resolve the authenticated user from the Supabase JWT, never from a
client-submitted user ID.

## Foundation Auth Behavior

The first database migration adds `public.handle_new_auth_user()`, which creates a `profiles` row
automatically whenever a new `auth.users` record is inserted.

This gives the rest of the backend a stable app-level user record to reference.

## Current Frontend Auth Integration

The current frontend is now wired to Supabase Auth for:

- email/password sign-up
- email/password sign-in
- password reset email requests
- Google sign-in initiation
- password recovery completion through `/auth/reset`
- protected-route gating for `/app`

Important notes:

- the browser only uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- the browser never receives the service-role key
- `/app` is blocked until a valid Supabase session exists
- password recovery relies on Supabase redirecting the user back to `/auth/reset`
- `/auth/reset` now also requires an active password-recovery session marker, so a normal
  authenticated session alone is not enough to use the recovery page
- OAuth sign-in relies on Supabase redirecting the user back to `/auth/callback`

Profile editing against `public.profiles` is not wired into the UI yet, but the auth session layer
and protected route boundary are now live.

## Authorization Model

Authorization is enforced in two layers:

1. Postgres Row Level Security for database access
2. Edge Function business checks for privileged actions such as AI generation, billing sync, and
   usage enforcement

RLS is the default safety boundary. Edge Function checks are the second line of defense.

## RLS Coverage In The Foundation Migration

### User-Owned Tables With RLS Enabled

- `profiles`
- `business_profiles`
- `subscriptions`
- `chats`
- `chat_messages`
- `generated_posts`
- `uploaded_assets`
- `generation_jobs`
- `usage_periods`
- `usage_events`

### Public Config Table With RLS Enabled

- `plans`

`plans` is readable by `anon` and `authenticated` users only when `is_active = true`.

### Internal Audit Table With RLS Enabled

- `billing_webhook_events`

No client policies are created for this table. It is intended for service-role workflows only.

## Policy Behavior By Table

### `profiles`

- users can `select` their own row
- users can `insert` their own row
- users can `update` their own row
- there is currently no client `delete` policy

Policy rule:

- `auth.uid() = id`

### `business_profiles`

- users can `select`, `insert`, `update`, and `delete` their own business profiles

Policy rule:

- `auth.uid() = user_id`

### `subscriptions`

- users can `select` their own subscription rows
- there are no client write policies

This is intentional because subscription writes should come from trusted backend workflows,
especially Lemon Squeezy webhook handling.

### `chats`

- users can `select`, `insert`, `update`, and `delete` their own chats
- `chats.user_id` defaults to `auth.uid()` for authenticated database inserts, and the frontend
  also sends the authenticated user ID explicitly for clear RLS checks

Policy rule:

- `auth.uid() = user_id`

### `chat_messages`

- users can `select` their own messages
- users can `insert` only their own `role = 'user'` messages
- there are currently no client `update` or `delete` policies
- assistant and system messages are reserved for server-side workflows

Policy rule:

- `auth.uid() = user_id and role = 'user'` for client inserts

### `generated_posts`

- users can `select` their own generated post rows
- there are no client write policies in this first pass

This keeps AI output creation and version chaining server-controlled.

### `uploaded_assets`

- users can `select` their own asset metadata rows
- there are currently no client write policies

This is intentional in the current backend state because asset metadata should only be written by
trusted upload-preparation or ingestion workflows, not directly by the browser.

### `generation_jobs`

- users can `select` their own generation job rows
- there are no client write policies

This keeps job creation and status transitions server-controlled.

### `usage_periods`

- users can `select` their own usage periods
- there are no client write policies

### `usage_events`

- users can `select` their own usage events
- there are no client write policies

## Storage Security Direction

Storage rules are now implemented for the first onboarding/upload pass:

- private buckets by default
- object paths partitioned by user
- Postgres stores only metadata and storage references

Current bucket families:

- `brand-assets`
- `chat-assets`
- `generated-posts`

Current object-path rules:

- the first path segment must equal `auth.uid()`
- `brand-assets` paths must use `/<user-id>/logos/...` or `/<user-id>/references/...`
- `chat-assets` paths must use `/<user-id>/attachments/...`
- `generated-posts` paths must use `/<user-id>/renders/...`

Current client Storage policies:

- authenticated users can `select` their own objects when the path matches the ownership rule
- authenticated users can `delete` their own objects when the path matches the ownership rule
- direct client `insert` is intentionally not open; onboarding uploads use signed upload URLs
  prepared by the backend

## Security Rules

- never trust client-submitted ownership IDs
- never trust frontend payment success messages
- never let the client write subscription state
- never let the client create assistant/system messages directly
- never let the client mutate stored chat history directly unless a specific audited workflow needs it
- never let the client write uploaded asset metadata directly
- never expose service-role keys or OpenAI API keys to the client

## What Still Needs Follow-Up

The next security-related backend passes should add:

- webhook-only subscription write flows
- prompt-template ownership/visibility rules if prompt versioning is stored in Postgres
