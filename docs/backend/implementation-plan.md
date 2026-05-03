# Backend Implementation Plan

## Selected Stack

Use:

- frontend: React + Vite
- backend: Supabase
- database: Supabase Postgres
- auth: Supabase Auth
- storage: Supabase Storage
- server-side logic: Supabase Edge Functions
- AI: OpenAI API through Edge Functions only
- billing: Lemon Squeezy

This stack is appropriate for the current app because it keeps the system simple, secure, and
maintainable while still covering auth, storage, AI orchestration, and subscriptions.

## Build Order

### 1. Foundation And Documentation

Build first:

- backend docs
- environment variable contract
- Supabase project structure
- migration strategy
- shared naming conventions

Why first:

- this defines the contract for every later feature

### 2. Database Schema

Build next:

- `profiles`
- `business_profiles`
- `plans`
- `subscriptions`
- `chats`
- `chat_messages`
- `generated_posts`
- `uploaded_assets`
- `generation_jobs`

Why here:

- every backend feature depends on clean relational structure

### 3. Auth And Profile Management

Build next:

- Supabase Auth setup
- email/password auth
- Google sign-in
- password reset flow
- profile creation/update flow

Why here:

- identity and ownership must exist before data access rules can be validated end-to-end

Current status:

- the frontend auth shell is now wired for email/password sign-up, login, reset initiation,
  Google sign-in initiation, password recovery completion, and protected `/app` access
- the authenticated onboarding flow now writes a default `business_profiles` row plus related
  `uploaded_assets`
- broader profile read/update UI still needs to be completed

### 4. RLS And Storage Policies

Build next:

- RLS for all user-owned tables
- protected Storage bucket strategy
- ownership-safe storage path conventions

Why here:

- security boundaries should be enforced before business features are exposed

Current status:

- baseline table RLS is live
- private Storage buckets and user-owned Storage object policies are live
- signed upload preparation/finalization is now wired for onboarding assets

### 5. Chat Persistence

Build next:

- create chats
- append messages
- list chat history
- load a chat and its related generated posts

Why here:

- the product is chat-shaped, so this is the backbone for AI workflows

Current status:

- authenticated users can create, list, load, rename, and delete chat records from the minimal
  `/app` chat shell
- prompt attachments are saved through the signed upload flow and linked to chat messages
- generated-post history is loaded with signed previews when records exist
- deleting a chat now detaches linked uploaded-asset metadata at the database FK layer so chat
  deletion is not blocked by prompt attachments
- related generated-post and generation-job pointer columns are also cleared on parent deletion so
  chat cleanup is not blocked by child-to-child relationships

### 6. Onboarding Context And Asset Intake

Build next:

- business type storage
- brand profile fields
- onboarding and prompt asset uploads
- reusable asset metadata

Why here:

- AI generation quality depends on profile and asset context

Current status:

- the first onboarding flow is now live for authenticated users entering `/app`
- onboarding currently collects business type, business name, optional logo, optional reference
  images, preferred caption tone, and optional brand colors

### 7. Payment Plan Catalog And Checkout Setup

Build next:

- plan definitions
- checkout preparation flow
- local plan-to-feature mapping

Why here:

- subscription state must exist before paid generation is enforced

### 8. Lemon Squeezy Webhook Processing

Build next:

- webhook verification
- event persistence
- subscription syncing
- idempotent retries

Why here:

- this is the real source of truth for account tier state

### 9. Usage Tracking And Tier Enforcement

Build next:

- usage tables and counters
- usage period resolution
- usage event recording
- per-tier generation and edit limits

Why here:

- expensive AI operations should not run before limits are enforceable

### 10. AI Generation Function

Build next:

- initial post generation pipeline
- prompt validation
- bounded context assembly
- OpenAI call orchestration
- generated post and version persistence

Why here:

- by this point auth, billing, storage, and usage protections already exist

Current status:

- `generate-post` now implements the synchronous MVP path for image and caption generation
- the first prompt in a chat creates an initial generated post
- later prompts in the same chat create edited generated-post versions
- personalized reference images are used when available
- fallback reference image sets for users without personalized references are deferred

### 11. AI Edit/Regeneration Function

Build next:

- follow-up edit prompts
- generated-post versioning
- optional attachment-based edits

Why here:

- this extends the first generation path and depends on versioned post history

### 12. Export/Output Retrieval Layer

Build next:

- private retrieval of generated outputs
- storage metadata cleanup rules
- safe client fetch patterns

Why here:

- users need reliable access to saved outputs after generation is stable

### 13. Observability And Hardening

Build next:

- structured logs
- internal error categories
- retry-safe webhook and AI flows
- rate limiting or abuse safeguards if needed

Why here:

- stability and supportability should be added before production rollout

### 14. Deployment

Final step:

- production Supabase project setup
- production secrets and env configuration
- production Lemon webhook registration
- production OpenAI credentials
- smoke testing of auth, billing, generation, and storage flows

This should be the last step, after all core backend flows work in a controlled environment.

## Non-Goals For The First Backend Pass

- team workspaces
- collaborative editing
- public sharing links
- advanced analytics dashboards
- queue infrastructure beyond what is necessary for basic reliable generation flows
