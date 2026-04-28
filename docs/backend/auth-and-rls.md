# Authentication And Authorization

## Authentication

Use Supabase Auth for:

- email/password sign-up
- email/password sign-in
- password reset
- Google sign-in

All backend functions should resolve the authenticated user from the Supabase JWT, never from a
client-submitted user ID.

## Authorization Model

Authorization should be enforced in two layers:

1. Postgres RLS for all user-owned tables
2. server-side business checks inside Edge Functions for expensive or privileged actions

RLS is the default guardrail. Edge Function checks are the second line of defense.

## RLS Rules By Table

### User-Owned Tables

These tables should be readable and writable only by their owner unless a server-side function
uses service-role privileges:

- `profiles`
- `profile_reference_assets`
- `subscriptions`
- `chats`
- `messages`
- `message_attachments`
- `generated_posts`
- `generated_post_versions`
- `assets`
- `usage_periods`
- `usage_events`

Typical policy shape:

- `select`: `auth.uid() = user_id`
- `insert`: `auth.uid() = user_id`
- `update`: `auth.uid() = user_id`
- `delete`: `auth.uid() = user_id`

For `profiles`, `id` itself is the user key, so policies should use `auth.uid() = id`.

### Restricted Internal Tables

These should not be writable by normal clients:

- `subscription_plans`
- `billing_webhook_events`

Recommendation:

- allow public or authenticated read access to `subscription_plans` only if needed for pricing UI
- block client writes entirely
- reserve writes to service-role contexts or migrations

## Storage Authorization

Storage buckets should be separated by purpose:

- `profile-reference-assets`
- `message-attachments`
- `generated-posts`
- `asset-library`

Security rules:

- private buckets by default
- users can access only objects they own
- generated outputs remain private unless the product later adds explicit sharing

Use consistent object path conventions such as:

- `user/{user_id}/profile/...`
- `user/{user_id}/attachments/...`
- `user/{user_id}/generated/...`
- `user/{user_id}/assets/...`

## Function-Level Authorization

Some checks do not belong purely in RLS and must happen in Edge Functions:

- subscription eligibility
- monthly usage limit checks
- ownership validation across multiple related records
- attachment count, file type, and file size validation
- generation/edit permission checks for a specific post or chat

## Security Rules

- never trust user-submitted ownership IDs
- never trust frontend payment success messages
- never allow the client to increment usage directly
- never expose service-role or OpenAI credentials
- never let the client choose arbitrary storage paths for privileged operations

## Password Reset

Password reset should remain within Supabase Auth flows. The app backend should not implement its
own password storage or recovery logic.
