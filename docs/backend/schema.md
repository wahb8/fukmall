# Database Schema

## Design Goals

- keep the schema normalized
- separate binary storage from relational records
- preserve chat history and generated-post version history
- make ownership explicit on every user-related record
- support future changes without breaking core relationships

## Core Tables

### `profiles`

One row per auth user.

Suggested columns:

- `id uuid primary key references auth.users(id) on delete cascade`
- `email text`
- `full_name text`
- `avatar_path text`
- `business_type text`
- `brand_summary text`
- `brand_voice text`
- `default_locale text default 'en'`
- `onboarding_completed boolean default false`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Notes:

- keep profile data lightweight
- richer brand context can live in a separate table if it grows

### `profile_reference_assets`

Reference assets collected during onboarding or later profile tuning.

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `profile_id uuid not null references profiles(id) on delete cascade`
- `storage_path text not null`
- `mime_type text not null`
- `file_size_bytes integer not null`
- `source text not null default 'onboarding'`
- `created_at timestamptz default now()`

### `subscription_plans`

Local catalog of supported plans.

Suggested columns:

- `id uuid primary key`
- `code text unique not null`
- `name text not null`
- `tier_rank integer not null`
- `monthly_generation_limit integer`
- `monthly_edit_limit integer`
- `monthly_storage_limit_mb integer`
- `features jsonb not null default '{}'::jsonb`
- `active boolean not null default true`

Notes:

- this is a local entitlement map, not the billing source of truth

### `subscriptions`

Local snapshot of a user's subscription state synced from Lemon Squeezy.

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `plan_id uuid references subscription_plans(id)`
- `provider text not null default 'lemon_squeezy'`
- `provider_customer_id text`
- `provider_subscription_id text unique`
- `status text not null`
- `renews_at timestamptz`
- `ends_at timestamptz`
- `cancel_at timestamptz`
- `checkout_variant_id text`
- `raw_snapshot jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `billing_webhook_events`

Idempotency and audit table for Lemon Squeezy webhook events.

Suggested columns:

- `id uuid primary key`
- `provider text not null default 'lemon_squeezy'`
- `provider_event_id text unique`
- `event_type text not null`
- `payload jsonb not null`
- `processed_at timestamptz`
- `status text not null default 'received'`
- `error_message text`
- `created_at timestamptz default now()`

### `chats`

Top-level conversation container.

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `title text`
- `status text not null default 'active'`
- `last_message_at timestamptz`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `messages`

Chat messages and generation turns.

Suggested columns:

- `id uuid primary key`
- `chat_id uuid not null references chats(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `role text not null`
- `message_type text not null default 'text'`
- `content_text text`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`

Notes:

- `role` should support values such as `user`, `assistant`, and `system`
- keep system messages limited and server-managed

### `message_attachments`

Attachment metadata for user prompts or assistant responses.

Suggested columns:

- `id uuid primary key`
- `message_id uuid not null references messages(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `storage_path text not null`
- `mime_type text not null`
- `file_size_bytes integer not null`
- `attachment_kind text not null`
- `created_at timestamptz default now()`

### `generated_posts`

Logical generated post record tied to a chat and owner.

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `chat_id uuid not null references chats(id) on delete cascade`
- `current_version_id uuid`
- `title text`
- `status text not null default 'draft'`
- `requested_width integer`
- `requested_height integer`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `generated_post_versions`

Append-only versions for each generated post.

Suggested columns:

- `id uuid primary key`
- `generated_post_id uuid not null references generated_posts(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `source_message_id uuid references messages(id)`
- `version_number integer not null`
- `prompt_text text`
- `caption_text text`
- `image_storage_path text`
- `preview_storage_path text`
- `width integer`
- `height integer`
- `generation_model text`
- `generation_status text not null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`

Notes:

- each edit should create a new version row
- `generated_posts.current_version_id` should point to the latest active version

### `assets`

User-owned reusable uploaded assets outside message attachments.

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `storage_path text not null`
- `mime_type text not null`
- `file_size_bytes integer not null`
- `label text`
- `source text not null default 'library'`
- `created_at timestamptz default now()`

### `usage_periods`

Usage buckets per user and billing window.

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `subscription_id uuid references subscriptions(id)`
- `period_start timestamptz not null`
- `period_end timestamptz not null`
- `generation_count integer not null default 0`
- `edit_count integer not null default 0`
- `storage_bytes_used bigint not null default 0`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `usage_events`

Append-only event log for billable or limited actions.

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `usage_period_id uuid references usage_periods(id)`
- `event_type text not null`
- `resource_id uuid`
- `quantity integer not null default 1`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`

## Relationships Summary

- `auth.users 1:1 profiles`
- `profiles 1:n profile_reference_assets`
- `auth.users 1:n subscriptions`
- `subscription_plans 1:n subscriptions`
- `auth.users 1:n chats`
- `chats 1:n messages`
- `messages 1:n message_attachments`
- `chats 1:n generated_posts`
- `generated_posts 1:n generated_post_versions`
- `auth.users 1:n assets`
- `auth.users 1:n usage_periods`
- `usage_periods 1:n usage_events`

## Naming Rules

- use plural table names
- use `user_id` for owner references
- use `storage_path` for Storage object references
- use `created_at` and `updated_at` consistently
- prefer explicit status columns over overloading JSON blobs

## Out Of Scope For V1 Schema

- team workspaces
- shared organization billing
- complex asset tagging systems
- reusable prompt-template marketplace features
- in-database vector search
