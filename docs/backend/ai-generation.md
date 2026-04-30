# AI Generation Flow

## Rules

- all OpenAI calls run through Edge Functions only
- the client never receives provider credentials
- only relevant context is sent to the model
- every expensive generation path is gated by auth, subscription, and usage checks

## Generation Pipeline

The current MVP implementation starts in `supabase/functions/generate-post`, is tracked through
`supabase/functions/generation-job-status`, and can be interrupted through
`supabase/functions/cancel-generation-job`.

Current model defaults:

- image generation uses `gpt-image-2` by default and can be overridden with the
  `OPENAI_IMAGE_MODEL` Supabase secret
- caption generation uses `gpt-4.1-mini` by default and can be overridden with
  `OPENAI_CAPTION_MODEL`
- chat title generation uses `gpt-4.1-mini` by default and can be overridden with
  `OPENAI_TITLE_MODEL`
- GPT Image model defaults use the direct Images API; older/mainline overrides can still use the
  Responses image-generation tool path
- image quality defaults to `medium` in code to reduce generation latency and timeout risk; it can be overridden with
  `OPENAI_IMAGE_QUALITY`
- image requests are guarded by `OPENAI_IMAGE_TIMEOUT_MS` so provider delays fail cleanly before the
  platform kills the function; the code default is `135000` ms, while the current dev deployment is
  configured at `145000` ms
- high-quality final/export generation can be added later as a separate product flow if needed
- image and caption provider calls run in a background generation job so the browser does not hold
  one long request open while OpenAI creates the image
- image and caption provider calls still run in parallel inside that job so caption generation does
  not add extra wait time after the image finishes
- automatic chat titles are generated as a separate best-effort background task only on the first
  prompt when the chat still has a default title like `Untitled`, `Untitled chat`, `New file`, or `New post`
- generated titles update the chat only if the title is still unchanged, so manual renames or later
  prompts do not get overwritten
- GPT Image 2 reference-image requests omit `input_fidelity` because that model already processes
  image inputs at high fidelity
- uploaded logo, brand-reference, and prompt-attachment assets can include optional optimized WEBP
  copies capped at 1024px on the longest side; generation signs and sends those optimized copies
  when present, while keeping the original uploads untouched
- if an older uploaded asset does not have a stored optimized copy, `generate-post` requests a
  transformed 1024px WEBP signed URL from Supabase Storage for large PNG/JPEG/WEBP references
  before falling back to the original object

### Initial Post Generation

1. authenticate the user
2. validate input prompt, dimensions, and attachment references
3. verify chat ownership
4. verify subscription tier and usage availability
5. fetch profile context:
   - business type
   - brand summary and voice
   - reference asset metadata if needed
6. fetch bounded recent chat context
7. fetch attachment metadata for the current request
8. write a `generation_jobs` row with `status = 'pending'`
9. schedule best-effort chat title generation if the chat still has an automatic/default title
10. return `202 Accepted` to the frontend with the job ID
11. run the generation in the Edge Function background task
12. move the job to `processing`
13. build structured prompts
14. call OpenAI
15. store generated outputs in Storage
16. write message, post, version, and usage records
17. move the job to `completed`, `failed`, or `canceled`
18. let the frontend poll `generation-job-status` until the generated post is ready
19. return the completed generated-post preview from `generation-job-status` so the frontend can
    paint the canvas before the heavier full chat-session refresh finishes

If the user presses stop while a job is active, the frontend aborts its request/polling and calls
`cancel-generation-job`. The background worker checks the job state before writing final artifacts,
so a canceled job should not attach a late generated post to the chat.

When a newer generation starts in the same chat, `generate-post` also cancels older pending or
processing jobs and only allows the latest job in that chat to persist output. This prevents quick
stop/start cycles from saving multiple late images.

Current prompt behavior:

- when profile reference images exist, the image prompt starts from the user's requested behavior:
  `Create a polished Instagram post design that matches the visual style, mood, color palette, typography feel, spacing, and composition style of the attached reference images.`
- attached reference images are treated as style references only; the prompt tells the model not to
  copy exact layouts, logos, text, people, products, or specific objects unless the user explicitly
  asks for them
- when reference images exist, the prompt now also asks the model to preserve the reference color
  scheme and keep any additional colors aligned with the post and brand mood
- saved brand logos are attached separately from style references and are sent to OpenAI with the
  file name `logo`; when a logo exists, the prompt explicitly allows using it as the brand logo while
  keeping it subtle and professionally integrated
- when no saved logo exists, the prompt explicitly tells the model not to invent a logo
- when no profile reference images exist, fallback reference images are deferred and the function
  uses the no-reference prompt: `Create a polished Instagram post design based on the written brand
  context and user request.`
- caption generation uses a separate caption-only prompt based on the user request and returns only
  the caption text

### Follow-Up Edit Generation

1. authenticate the user
2. validate the prompt and referenced post/chat IDs
3. verify ownership of all referenced records
4. fetch the latest version and relevant prior context
5. enforce edit limits
6. call OpenAI for the next version
7. store output
8. append a new version row
9. record usage event

Current MVP behavior:

- `generate-post` treats any chat with an existing generated post as an edit request
- each edit writes a new `generated_posts` row with `previous_post_id`, `version_group_id`, and an
  incremented `version_number`
- a dedicated `edit-post` function can still be added later if the edit flow needs a separate API

## Context Strategy

Do not send entire chats by default.

Preferred context selection:

- current user prompt
- latest relevant assistant response
- a bounded number of recent turns
- current post version metadata
- business profile context
- selected reference assets only when useful

This keeps cost, latency, and irrelevant context growth under control.

## Prompt Construction

Keep prompts layered:

- system prompt: product behavior, style constraints, response structure
- business context prompt: profile/onboarding brand identity
- task prompt: current user goal
- optional attachment/reference notes

Prompt templates should be centralized so they can be updated without rewriting multiple
functions.

## Storage Of Outputs

Store generated files in Storage and metadata in Postgres.

Recommended metadata to save:

- model used
- generation type
- prompt text or prompt reference
- dimensions
- attachment references
- latency if measured
- provider response IDs if useful for tracing

## Reliability

- handle provider failures explicitly
- use bounded retries only for safe failure classes
- do not double-charge usage events for failed attempts
- keep post version creation transactional where practical
- reducing the number of brand reference images per request is intentionally deferred because it
  could affect style accuracy and consistency
- the current async implementation uses Supabase Edge Function background tasks; a durable queue or
  scheduled worker can be added later if generation needs to survive provider delays beyond the Edge
  Runtime lifecycle
- optimized reference images reduce Storage download time, Edge Function preparation time, and
  OpenAI upload/process time without changing the user's saved original files
- transformed signed URLs make the same optimization path available to older uploads that were
  created before stored optimized copies existed
