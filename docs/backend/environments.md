# Environments

## Goal

The app should run with two isolated backend environments:

- `development`
- `production`

Do not share Supabase projects, service-role keys, Storage buckets, or Lemon webhook secrets across
these environments.

## Recommended Environment Model

Use:

- one Supabase project for development
- one separate Supabase project for production
- one frontend env file per environment
- one server-side secret set per environment

This is the safest baseline because:

- migrations can be tested without risking production data
- webhook traffic can be isolated
- service-role credentials stay environment-specific
- usage tracking and subscription state cannot leak across environments

## Frontend Environment Variables

Frontend variables are public by design and should only contain safe browser values.

### Development

Template file:

- `/.env.development.example`

Variables:

- `VITE_APP_ENV`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Production

Template file:

- `/.env.production.example`

Variables:

- `VITE_APP_ENV`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Rules:

- never put service-role keys in Vite env files
- never put OpenAI keys in Vite env files
- never put Lemon webhook secrets in Vite env files
- these frontend values are now required for the live auth UI to function

## Server-Side Environment Variables

Server-side values are for Edge Functions, webhooks, and privileged backend operations only.

### Development

Template file:

- `supabase/.env.development.example`

Variables:

- `SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `LEMON_SQUEEZY_API_KEY`
- `LEMON_SQUEEZY_STORE_ID`
- `LEMON_SQUEEZY_WEBHOOK_SECRET`
- `APP_BASE_URL`

### Production

Template file:

- `supabase/.env.production.example`

Variables:

- `SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `LEMON_SQUEEZY_API_KEY`
- `LEMON_SQUEEZY_STORE_ID`
- `LEMON_SQUEEZY_WEBHOOK_SECRET`
- `APP_BASE_URL`

## Provider Separation

### Supabase

Keep development and production fully separate:

- different project IDs
- different database instances
- different auth users
- different storage data
- different service-role keys

Configure auth provider settings separately in each project:

- site URL for the environment
- redirect URL for `/auth/callback`
- redirect URL for `/auth/reset`
- Google OAuth provider credentials if Google sign-in is enabled

### Lemon Squeezy

Use separate environment-specific billing setup:

- development should use test-mode or isolated non-production variants and webhook secrets
- production should use real production variants and a production webhook secret

Do not point both environments at the same webhook endpoint or use the same signing secret.

### OpenAI

Separate keys are recommended so:

- dev usage is easy to measure
- prod rotation is isolated
- abuse or leakage in one environment does not automatically compromise the other

## Naming Conventions

Use these runtime labels consistently:

- `development`
- `production`

Avoid custom aliases such as `dev2`, `live`, or `main-prod` in code paths unless there is a
strong operational reason.

## Deployment Rules

- deploy migrations to development first
- validate auth, storage, webhooks, and AI flows in development
- promote the same migration/function changes to production only after validation
- set production secrets directly in the production Supabase project, not in the repo

## Initial Setup Steps

### Development

1. copy `/.env.development.example` to `/.env.development`
2. copy `supabase/.env.development.example` to the local secret file used for backend work
3. create a dedicated Supabase dev project
4. configure development Lemon webhook/test billing setup
5. use development OpenAI credentials
6. add the local dev auth redirect URLs in Supabase, including `/auth/callback` and `/auth/reset`

### Production

1. copy `/.env.production.example` to `/.env.production` only in the production environment
2. configure production secrets in Supabase and deployment infrastructure
3. create a dedicated Supabase production project
4. configure production Lemon products, variants, and webhook endpoint
5. use production OpenAI credentials
6. add the production auth redirect URLs in Supabase, including `/auth/callback` and `/auth/reset`

## Current Scope

This is an environment scaffold only.

It does not yet include:

- actual Supabase migrations
- actual Edge Functions
- actual deployment automation
