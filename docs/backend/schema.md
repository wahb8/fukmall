# Database Schema

## Scope Of This Foundation Pass

The first database migration creates these core tables:

- `profiles`
- `business_profiles`
- `plans`
- `subscriptions`
- `chats`
- `chat_messages`
- `generated_posts`
- `uploaded_assets`
- `generation_jobs`

The second database migration adds:

- `usage_periods`
- `usage_events`
- `billing_webhook_events`

The third database migration adds:

- seeded `plans` rows for `free`, `business`, and `enterprise`
- `usage_periods.asset_upload_count`
- private Storage buckets plus Storage object policies

This matches the current MVP backend shape:

- `profiles`: who the user is
- `business_profiles`: how the user's brand should look and feel
- `plans` and `subscriptions`: what the user is allowed to do
- `chats`: a project or conversation
- `chat_messages`: the prompt/response history inside that project
- `generated_posts`: the actual AI-created content, including versions
- `uploaded_assets`: logos, reference posts, prompt images, and other user files
- `generation_jobs`: tracked AI work and its status

## Foundation Helpers

The migration also creates:

- `public.set_updated_at()`: shared `updated_at` trigger function
- `public.handle_new_auth_user()`: auto-creates a `profiles` row from `auth.users`
- `public.touch_chat_last_message_at()`: updates chat activity when a new message is inserted

## Core Tables

### `profiles`

Purpose:

- stores the app-level user record tied to Supabase Auth

Columns:

- `id uuid primary key references auth.users(id) on delete cascade`
- `email text`
- `full_name text`
- `avatar_url text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- this is the anchor table for all user-owned records
- the migration auto-creates this row when a new auth user is inserted

### `business_profiles`

Purpose:

- stores brand identity and generation context

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references profiles(id) on delete cascade`
- `name text not null`
- `business_type text not null`
- `brand_description text`
- `tone_preferences text[] not null default '{}'`
- `style_preferences text[] not null default '{}'`
- `brand_colors jsonb not null default '[]'::jsonb`
- `reference_links jsonb not null default '[]'::jsonb`
- `logo_asset_id uuid`
- `is_default boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- one user can store multiple business profiles
- a partial unique index enforces only one default business profile per user
- `logo_asset_id` points to an `uploaded_assets` row after that table exists

### `plans`

Purpose:

- defines subscription tiers and limits

Columns:

- `id uuid primary key default gen_random_uuid()`
- `code text unique not null`
- `name text unique not null`
- `description text`
- `lemon_squeezy_variant_id text unique`
- `monthly_generation_limit integer not null default 0`
- `monthly_storage_limit_bytes bigint not null default 0`
- `monthly_asset_upload_limit integer not null default 0`
- `feature_flags jsonb not null default '{}'::jsonb`
- `price_cents integer not null default 0`
- `currency_code text not null default 'USD'`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- this is a configuration table, not a per-user table
- it is intended to map cleanly to Lemon Squeezy variants
- the current migration seeds `free`, `business`, and `enterprise` rows so the app can enforce a
  fallback free plan before billing is fully connected

### `subscriptions`

Purpose:

- stores each user's current billing snapshot and access tier

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references profiles(id) on delete cascade`
- `plan_id uuid not null references plans(id)`
- `status text not null default 'active'`
- `lemon_squeezy_customer_id text`
- `lemon_squeezy_subscription_id text unique`
- `renewal_date timestamptz`
- `canceled_at timestamptz`
- `expired_at timestamptz`
- `current_period_start timestamptz`
- `current_period_end timestamptz`
- `cancel_at_period_end boolean not null default false`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- a partial unique index enforces only one current paid/trialing subscription row per user
- final truth still comes from verified Lemon Squeezy webhooks

### `chats`

Purpose:

- stores a single project or design conversation

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references profiles(id) on delete cascade`
- `business_profile_id uuid`
- `title text not null default 'Untitled chat'`
- `status text not null default 'active'`
- `last_message_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- the table stores a composite owner key `(id, user_id)` so child tables can reference a chat and
  its owner together
- `business_profile_id` ties a chat to the brand context used for generation

### `chat_messages`

Purpose:

- stores each prompt/response message inside a chat

Columns:

- `id uuid primary key default gen_random_uuid()`
- `chat_id uuid not null`
- `user_id uuid not null references profiles(id) on delete cascade`
- `role text not null`
- `message_type text not null default 'text'`
- `content_text text`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Notes:

- `role` is constrained to `user`, `assistant`, or `system`
- `message_type` is constrained to `text`, `generation_request`, `generation_result`,
  `edit_request`, `error`, or `system`
- the client can only insert `role = 'user'` rows under RLS; assistant/system messages are
  expected to come from server-side workflows
- client-side update and delete are intentionally blocked in this first pass to preserve chat
  history integrity
- a trigger updates `chats.last_message_at` after inserts

### `uploaded_assets`

Purpose:

- stores metadata for files uploaded to Supabase Storage

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references profiles(id) on delete cascade`
- `business_profile_id uuid`
- `chat_id uuid`
- `asset_kind text not null`
- `bucket_name text not null`
- `storage_path text not null`
- `original_file_name text`
- `mime_type text not null`
- `file_size_bytes bigint not null`
- `width integer`
- `height integer`
- `optimized_bucket_name text`
- `optimized_storage_path text`
- `optimized_mime_type text`
- `optimized_file_size_bytes bigint`
- `optimized_width integer`
- `optimized_height integer`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- file binaries live in Storage, not Postgres
- a unique constraint on `(bucket_name, storage_path)` prevents duplicate path records
- optimized references are optional WEBP copies stored beside the original upload and used only for
  generation; original files remain available for previews, profile management, and future export
  behavior
- `asset_kind` covers logo, brand-reference, prompt attachment, chat attachment, generated input,
  and fallback `other`
- client-side metadata writes are intentionally blocked until the upload flow is implemented through
  trusted backend/storage rules

### `generated_posts`

Purpose:

- stores AI-generated output records and their version history

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references profiles(id) on delete cascade`
- `chat_id uuid not null`
- `source_message_id uuid`
- `business_profile_id uuid`
- `previous_post_id uuid`
- `version_group_id uuid not null default gen_random_uuid()`
- `version_number integer not null default 1`
- `status text not null default 'draft'`
- `prompt_text text`
- `caption_text text`
- `bucket_name text`
- `image_storage_path text`
- `width integer not null`
- `height integer not null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- each edit or regeneration creates a new row in this table
- `previous_post_id` links a version to the row it was derived from
- `version_group_id` groups all versions of the same logical post
- statuses are constrained to `draft`, `edited`, `final`, `exported`, or `failed`
- generated image files are referenced by storage bucket/path, not stored inline

### `generation_jobs`

Purpose:

- tracks the lifecycle of AI generation work

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references profiles(id) on delete cascade`
- `chat_id uuid not null`
- `source_message_id uuid`
- `business_profile_id uuid`
- `output_post_id uuid`
- `status text not null default 'pending'`
- `input_prompt text not null`
- `requested_width integer`
- `requested_height integer`
- `provider text not null default 'openai'`
- `model text`
- `error_message text`
- `request_payload jsonb not null default '{}'::jsonb`
- `response_payload jsonb not null default '{}'::jsonb`
- `queued_at timestamptz not null default now()`
- `started_at timestamptz`
- `completed_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- statuses are constrained to `pending`, `processing`, `completed`, `failed`, or `canceled`
- `canceled` is used when the user interrupts an in-progress async generation from the frontend
- this supports the current async MVP and gives a clean path to durable job processing later

### `usage_periods`

Purpose:

- stores the active usage window and counters for a user

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references profiles(id) on delete cascade`
- `subscription_id uuid references subscriptions(id) on delete set null`
- `period_start timestamptz not null`
- `period_end timestamptz not null`
- `generation_count integer not null default 0`
- `edit_count integer not null default 0`
- `asset_upload_count integer not null default 0`
- `storage_bytes_used bigint not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- a unique constraint prevents duplicate windows for the same user
- the current usage window is derived from the active subscription period when available
- if no billing period is available, the backend can fall back to the current calendar month
- `asset_upload_count` supports `monthly_asset_upload_limit` enforcement without relying on ad hoc
  aggregate queries

### `usage_events`

Purpose:

- stores append-only usage audit records

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references profiles(id) on delete cascade`
- `usage_period_id uuid not null`
- `event_type text not null`
- `resource_type text`
- `resource_id uuid`
- `quantity integer not null default 1`
- `storage_bytes_delta bigint not null default 0`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Notes:

- `event_type` is constrained to `generation`, `edit`, `storage_upload`, `storage_delete`, or
  `manual_adjustment`
- `(usage_period_id, user_id)` references the matching owned usage period, so usage rows cannot be
  cross-linked across users
- this table is append-only from the product point of view
- the migration also adds `public.record_usage_event(...)` to insert a usage event and atomically
  update the matching `usage_periods` counters
  update the matching `usage_periods` counters, including `asset_upload_count` for uploaded assets

## Storage Bucket Layout

Current private bucket families:

- `brand-assets`
- `chat-assets`
- `generated-posts`

Current owned path conventions:

- `brand-assets/<user-id>/logos/...`
- `brand-assets/<user-id>/references/...`
- `chat-assets/<user-id>/attachments/...`
- `generated-posts/<user-id>/renders/...`

### `billing_webhook_events`

Purpose:

- stores Lemon Squeezy webhook payloads and processing state for audit/debugging

Columns:

- `id uuid primary key default gen_random_uuid()`
- `provider text not null default 'lemon_squeezy'`
- `event_name text not null`
- `event_hash text not null unique`
- `provider_object_id text`
- `status text not null default 'received'`
- `processing_attempts integer not null default 0`
- `last_error text`
- `payload jsonb not null`
- `received_at timestamptz not null default now()`
- `processed_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- Lemon Squeezy does not always expose a dedicated event ID, so the current dedupe key is a stable
  hash of the raw payload body
- statuses are constrained to `received`, `processed`, `ignored`, or `failed`
- this table is intentionally server-controlled only

## Ownership And Relationship Rules

The schema uses composite owner keys on several user-owned tables:

- `business_profiles (id, user_id)`
- `chats (id, user_id)`
- `chat_messages (id, user_id)`
- `uploaded_assets (id, user_id)`
- `generated_posts (id, user_id)`
- `generation_jobs (id, user_id)`

This lets child tables reference both the resource and its owner together, which reduces the risk
of cross-user linking mistakes.

Key relationships:

- `profiles 1:n business_profiles`
- `profiles 1:n subscriptions`
- `profiles 1:n chats`
- `chats 1:n chat_messages`
- `profiles 1:n uploaded_assets`
- `chats 1:n generated_posts`
- `chat_messages 1:n generated_posts` through `source_message_id`
- `generated_posts` self-references through `previous_post_id`
- `generated_posts` can be linked back from `generation_jobs.output_post_id`
- `profiles 1:n usage_periods`
- `usage_periods 1:n usage_events`

## Status Design

Status values added in this migration:

- `subscriptions.status`: `trialing`, `active`, `canceled`, `expired`, `past_due`
- `chats.status`: `active`, `archived`
- `generated_posts.status`: `draft`, `edited`, `final`, `exported`, `failed`
- `generation_jobs.status`: `pending`, `processing`, `completed`, `failed`, `canceled`
- `usage_events.event_type`: `generation`, `edit`, `storage_upload`, `storage_delete`,
  `manual_adjustment`
- `billing_webhook_events.status`: `received`, `processed`, `ignored`, `failed`

These status constraints support the current MVP flow and match the intended future job and content
lifecycles.

## What Is Intentionally Not In These Migrations

Not yet included:

- prompt-template version tables
- generated export event tables
- teams or multi-user workspaces

Those should come in follow-up migrations once this foundation is in place.
