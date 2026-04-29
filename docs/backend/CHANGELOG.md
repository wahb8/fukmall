# Backend Docs Changelog

## 2026-04-29

- added generation interruption support with `cancel-generation-job`, a `canceled`
  `generation_jobs` status, frontend abort handling, and composer stop-button behavior
- hardened generation interruption by canceling older pending/processing jobs when a newer
  generation starts in the same chat and preventing non-latest jobs from persisting output
- hardened cancellation races so a canceled job cannot be overwritten to `completed`, generated
  artifacts are rolled back before usage is recorded, and cancel requests return the current job
  state if the job already reached a terminal status
- updated the `generate-post` OpenAI image-generation default to `gpt-image-2`
- routed GPT Image model requests through the direct Images API while preserving the existing
  Responses image-tool path for older/mainline overrides
- changed the synchronous MVP image quality default to `medium` and added an internal image timeout
  guard so slow provider calls fail cleanly instead of leaving generation jobs stuck in `processing`
- recorded the image model used in generated-post metadata and generation-job completion payloads
- increased the internal image timeout default to `135000` ms and parallelized image/caption
  provider calls to reduce avoidable `generate-post` timeouts
- changed the default OpenAI image quality from `medium` to `high` for higher-quality generated
  post outputs
- increased the dev `OPENAI_IMAGE_TIMEOUT_MS` deployment secret to `145000` ms and made
  timeout-specific chat errors visible as `Image generation timed out. Please try again.`

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
- tightened the Lemon Squeezy webhook sync so provider status variants normalize correctly, canceled subscriptions keep access through period end, and follow-up events can reuse the already synced local plan when variant IDs are omitted
- fixed the Lemon Squeezy webhook sync to preserve existing paid-through dates and prior cancel/expire timestamps when sparse follow-up events omit those fields
- documented the new minimal `/app` chat/file integration layer that now loads persisted chats,
  prompt attachments, and generated-post history through the existing Supabase schema and signed
  upload flow
- added the real `generate-post` Edge Function for synchronous MVP image and caption generation,
  follow-up edit-mode generation, generated-post version persistence, usage recording, and chat
  result messages
- documented that fallback reference images for users without personalized reference images are
  intentionally deferred while the function continues from written brand context
- fixed upload MIME normalization so PNG/JPEG files reported by browsers as aliases or generic
  binary uploads are still accepted when their file extension is a supported image type
- fixed upload finalization to read Supabase Storage object size and content type from the current
  top-level `info()` response fields, preventing normal uploads from being treated as zero-byte
  files
- fixed client-created chats under RLS by sending the authenticated `user_id` from the frontend and
  adding a database default of `auth.uid()` for chat/message ownership columns
- fixed the OpenAI image-generation request payload by removing the unsupported
  `tools[0].format` field from the Responses API image tool configuration
- changed `generate-post` to the async MVP flow: it now creates a `generation_jobs` row, returns
  `202 Accepted`, and performs OpenAI image/caption generation in a background task
- added the authenticated `generation-job-status` Edge Function so the frontend can poll generation
  progress until jobs complete or fail
- updated the `/app` prompt flow to keep the loading state active while polling, then refresh the
  chat and place the completed generated post onto the canvas
- changed the dev `OPENAI_IMAGE_QUALITY` secret to `auto` because forced `high` quality can exceed
  the hosted Edge Function wall-clock limit for slow GPT Image 2 generations
- changed the dev `OPENAI_IMAGE_QUALITY` secret from `auto` to `medium` for the current testing
  path
- fixed profile reference-image and logo removal so deleted assets and prior stale unlinked profile
  assets are removed from private Storage and `uploaded_assets` metadata
- made stale profile-asset cleanup best-effort so adding new logo/reference assets is not blocked by
  an old missing Storage object or usage cleanup failure
- made profile cleanup lookups best-effort and added client-side Edge Function names to upload/save
  errors so future failures identify the exact failing function
- updated the initial image-generation prompt to use the polished social-post design wording, with
  clearer style-reference rules and no-reference behavior
- updated generation prompt/input handling so saved brand logos are attached as a separate image
  named `logo`, with logo-specific prompt guidance that is omitted when no logo exists
