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
