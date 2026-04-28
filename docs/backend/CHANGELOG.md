# Backend Docs Changelog

## 2026-04-28

- added `docs/backend/` foundation documentation
- selected the backend stack: Supabase, OpenAI via Edge Functions, and Lemon Squeezy
- documented initial backend architecture and service boundaries
- drafted the normalized schema for users, chats, assets, generated posts, subscriptions, and usage
- documented auth, RLS, AI generation, payments, and usage-tracking rules
- added the first implementation plan from foundation through deployment
- added development and production environment scaffolding and secret templates
- added the first Supabase migration for the core database foundation tables and baseline RLS rules
- added the second migration for usage tracking and webhook audit tables
- scaffolded the first Edge Function layer with shared helpers, `llm-generate-post`, and `lemon-webhook`
- tightened the foundation review pass by removing unsafe client write policies for chat history and asset metadata
- fixed `llm-generate-post` request handling to deduplicate attachment IDs and roll back request messages if job creation fails
- fixed Lemon webhook subscription syncing to preserve period-start data safely and fail loudly if webhook audit state cannot be updated
- added live frontend Supabase Auth wiring for email/password sign-up, login, password reset, Google sign-in initiation, `/auth/callback`, and `/auth/reset`
- added protected-route gating so `/app` requires an authenticated Supabase session
- updated backend environment and auth docs to include required Supabase redirect URLs and the current auth integration status
- added Vitest unit coverage for backend shared helpers and the `llm-generate-post` / `lemon-webhook` handler orchestration paths
- documented which backend behaviors are now unit-tested versus what still requires live Supabase validation
- tightened the password-reset flow so `/auth/reset` requires a real recovery session marker instead of any authenticated session
- added the first onboarding/storage migration with seeded plan rows, Storage buckets/policies, and `usage_periods.asset_upload_count`
- added shared storage helpers plus the `prepare-upload`, `finalize-upload`, and `upsert-business-profile` Edge Functions
- added the first authenticated onboarding flow in the frontend, including `/app` onboarding gating and signed upload persistence through Supabase
- added unit coverage for onboarding UI flows, onboarding route gating, storage helpers, and the new upload/profile Edge Functions
