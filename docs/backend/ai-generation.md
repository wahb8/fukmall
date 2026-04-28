# AI Generation Flow

## Rules

- all OpenAI calls run through Edge Functions only
- the client never receives provider credentials
- only relevant context is sent to the model
- every expensive generation path is gated by auth, subscription, and usage checks

## Generation Pipeline

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
