# Backend Overview

## Goal

This directory documents the backend for Fukmall, an AI-powered social content tool that generates
editable posts, captions, and related assets.

The frontend already exists. These backend docs define the system before implementation so the
Supabase, AI, and payment layers can be built with clear boundaries and without avoidable
rework.

## Selected Stack

The recommended backend stack is:

- frontend: React + Vite
- backend platform: Supabase
- database: Supabase Postgres
- authentication: Supabase Auth
- storage: Supabase Storage
- server runtime: Supabase Edge Functions
- AI provider: OpenAI API, called only from Edge Functions
- payments and subscriptions: Lemon Squeezy

This stack fits the current app well because:

- it is simple enough for an early-stage product without introducing unnecessary infrastructure
- Postgres + RLS gives strong ownership and authorization controls
- Supabase Auth and Storage remove a lot of repetitive backend setup
- Edge Functions are a good place to isolate privileged AI and webhook logic
- Lemon Squeezy keeps subscription management lightweight without building billing infrastructure

## Product Behavior Assumptions

These docs currently assume the product behaves like this:

- users create accounts, sign in, reset passwords, and may sign in with Google
- users maintain a profile and onboarding context such as business type and reference assets
- user prompts are stored as chats/messages
- one chat can produce one or more generated post versions over time
- image and caption generation happens through server-side AI pipelines
- users may upload reference assets and prompt attachments
- users are limited by subscription tier and usage quotas
- the resulting work is saved as chat history and generated-post records

## Current Implementation Snapshot

The backend is no longer documentation-only.

Current implemented pieces:

- the core Supabase schema and baseline RLS policies
- usage and webhook audit tables
- initial Edge Function scaffolding for generation intake and Lemon webhook syncing
- live frontend Supabase Auth wiring for email/password sign-up, email/password sign-in,
  password-reset initiation, Google sign-in initiation, password-update recovery, and a protected
  `/app` route
- seeded `plans` rows for `free`, `business`, and `enterprise`
- private Storage buckets and ownership-safe Storage object policies
- signed upload preparation/finalization functions for onboarding and future attachment flows
- authenticated onboarding persistence for default `business_profiles` plus related `uploaded_assets`
- `/app` onboarding gating that requires a default business profile before normal editor use
- the minimal `/app` shell now loads persisted chats, prompt attachments, and saved generated-post
  history through the existing schema and upload pipeline
- `generate-post` now performs the first synchronous MVP OpenAI pipeline: auth, plan/usage checks,
  business profile loading, prompt construction, image and caption generation, Storage persistence,
  generated-post version creation, chat result messages, and usage recording

Still not implemented:

- checkout creation
- fallback reference image sets for users without personalized reference images
- asynchronous generation queues/background processing

## Current Test Coverage

The repo now includes executable unit coverage for the backend code that can run inside Vitest
without a live Supabase runtime.

Covered today:

- shared backend helpers for errors, env validation, HTTP responses, Lemon payload handling,
  subscription lookup, usage enforcement, request-auth resolution, and storage-path validation
- `llm-generate-post` handler orchestration with mocked Supabase/Deno boundaries
- `lemon-webhook` handler orchestration with mocked Supabase/Deno boundaries
- `prepare-upload`, `finalize-upload`, and `upsert-business-profile` handler orchestration with
  mocked Supabase/Deno boundaries
- `generate-post` handler orchestration, including initial generation, edit-mode generation, failed
  OpenAI calls, and prompt-template behavior for attached versus deferred reference images
- frontend onboarding coverage for the modal flow, `/app` onboarding gate, and pricing CTA routing
- frontend minimal-chat coverage for chat summaries, chat history rendering, prompt composer
  behavior, and the browser chat-session data layer

Not covered by unit tests yet:

- live SQL migration execution against a real Supabase database
- real Supabase Auth redirect/provider behavior
- real Edge Function runtime behavior inside Supabase
- real Lemon webhook payload delivery from the provider

## Document Map

- `architecture.md`: service boundaries, module responsibilities, and request flows
- `schema.md`: initial normalized Postgres schema and relationships
- `auth-and-rls.md`: authentication model, authorization rules, and row-level security policy plan
- `edge-functions.md`: planned function endpoints and backend API behavior
- `ai-generation.md`: OpenAI request pipeline and generation lifecycle
- `payments.md`: Lemon Squeezy integration and webhook source-of-truth rules
- `usage-tracking.md`: usage accounting and limit enforcement
- `environments.md`: development and production environment separation and secret layout
- `implementation-plan.md`: recommended build order from first feature through deployment
- `CHANGELOG.md`: running backend documentation changelog

## Core Principles

- keep privileged logic server-side only
- design every user-owned table with RLS from the start
- store binaries in Storage, not Postgres
- keep AI calls explicit, auditable, and constrained
- treat payment webhooks as the source of truth
- enforce usage limits before expensive operations
- prefer reliable, boring architecture over clever shortcuts
