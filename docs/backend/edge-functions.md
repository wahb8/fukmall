# Edge Functions

## Function Principles

Every function should:

- validate auth where required
- validate input shape before doing work
- check ownership and permissions
- return structured success and error responses
- avoid leaking internal details
- log important events

## Planned Functions

### `llm-generate-post`

Purpose:

- create a first generated post from a user prompt

Expected input:

- `chat_id`
- `prompt`
- `width`
- `height`
- optional `attachment_ids`

Expected behavior:

- verify auth
- verify chat ownership
- verify subscription and usage limit
- gather profile and onboarding context
- gather a bounded amount of recent chat context
- gather attachment metadata if provided
- construct the OpenAI request
- store generated image/caption outputs and metadata
- create or update the generated post and version records
- append usage event(s)

### `llm-edit-post`

Purpose:

- create a new version of an existing generated post from a follow-up prompt

Expected input:

- `chat_id`
- `generated_post_id`
- `prompt`
- optional `attachment_ids`

Expected behavior:

- verify auth
- verify ownership of the chat and generated post
- fetch the latest post version and bounded relevant context
- enforce edit limits
- call OpenAI
- write a new generated-post version
- update `generated_posts.current_version_id`
- append usage event(s)

### `lemon-webhook`

Purpose:

- verify and process Lemon Squeezy webhook events

Expected input:

- raw webhook request body
- Lemon webhook signature header

Expected behavior:

- verify signature
- deduplicate event
- persist raw payload for audit/debugging
- update local subscription state
- mark processing result

### `create-checkout`

Purpose:

- optionally create or prepare Lemon checkout sessions server-side

Expected input:

- requested plan code

Expected behavior:

- verify auth
- validate the requested plan against local allowed plans
- create a checkout link or signed handoff if needed
- never let the client choose arbitrary pricing identifiers

### `prepare-upload` (optional)

Purpose:

- centralize upload validation if direct client uploads need tighter control

Expected input:

- upload purpose
- file metadata

Expected behavior:

- validate type, size, and ownership context
- return approved upload destination details

## Response Shape

Use consistent JSON responses:

Successful response pattern:

```json
{
  "ok": true,
  "data": {}
}
```

Error response pattern:

```json
{
  "ok": false,
  "error": {
    "code": "LIMIT_EXCEEDED",
    "message": "Monthly generation limit reached."
  }
}
```

## Shared Internal Helpers

Recommended shared helper areas:

- auth resolution
- zod or equivalent schema validation
- typed error helpers
- usage enforcement
- plan lookup
- storage path generation
- OpenAI request builders
- webhook signature verification
