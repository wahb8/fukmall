# AI Generation Flow

## Rules

- all OpenAI calls run through Edge Functions only
- the client never receives provider credentials
- only relevant context is sent to the model
- every expensive generation path is gated by auth, subscription, and usage checks

## Generation Pipeline

The current MVP implementation lives in `supabase/functions/generate-post`.

Current model defaults:

- image generation uses `gpt-image-2` by default and can be overridden with the
  `OPENAI_IMAGE_MODEL` Supabase secret
- caption generation uses `gpt-4.1-mini` by default and can be overridden with
  `OPENAI_CAPTION_MODEL`
- GPT Image model defaults use the direct Images API; older/mainline overrides can still use the
  Responses image-generation tool path
- image quality defaults to `high` for best output quality; it can be overridden with
  `OPENAI_IMAGE_QUALITY`
- image requests are guarded by `OPENAI_IMAGE_TIMEOUT_MS` so provider delays fail cleanly before the
  platform kills the function; the code default is `135000` ms, while the current dev deployment is
  configured at `145000` ms for high-quality testing
- image and caption provider calls run in parallel so caption generation does not add extra wait
  time after the image finishes
- GPT Image 2 reference-image requests omit `input_fidelity` because that model already processes
  image inputs at high fidelity

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
8. build structured prompts
9. call OpenAI
10. store generated outputs in Storage
11. write message, post, version, and usage records
12. return structured result to the frontend

Current prompt behavior:

- when profile reference images exist, the image prompt starts from the user's requested behavior:
  `Using the attached images, create an Instagram post that matches their aesthetic and style. However, do not include anything from the attached images unless specified, only match the exact style of the images.`
- when no profile reference images exist, fallback reference images are deferred and the function
  uses written brand context instead of pretending images are attached
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
