# Usage Tracking

## Why Usage Tracking Exists

Usage tracking protects cost and enforces plan limits for AI-powered features.

The client must never be able to bypass this by directly modifying counters or skipping checks.

## What To Track

Track at minimum:

- generation requests
- edit/regeneration requests
- storage consumption

Optional later:

- caption-only generation counts
- failed generation attempts by category
- token or provider-cost analytics

Current database support:

- `usage_periods` stores per-window counters
- `usage_events` stores append-only event history
- `public.record_usage_event(...)` writes an event and updates counters together
- `usage_periods.asset_upload_count` now tracks finalized user-upload counts per usage window

## Enforcement Model

Usage enforcement should happen before expensive operations.

Recommended flow:

1. resolve active subscription tier
2. resolve current billing/usage period
3. compare requested action to allowed limits
4. reject early if limit is exceeded
5. perform the expensive operation
6. record usage event and update counters

Current implementation detail:

- the current `generate-post` function enforces generation/edit quotas before provider work starts
  and records usage only after the generated image, caption, post row, and assistant message are
  successfully stored
- onboarding and future attachment uploads now check both `monthly_asset_upload_limit` and
  `monthly_storage_limit_bytes` before signed uploads are issued and again before metadata is
  finalized

## Reliability Rules

- usage events should be append-only
- summary counters should be derived from or backed by event records
- failed or rejected requests should not consume successful-generation quota unless explicitly intended
- Edge Functions, not the client, must write usage records
- users can read their own usage rows, but they cannot write them directly

## Suggested Limit Types

- monthly generations
- monthly edits
- monthly asset uploads
- storage quota

These limits should be defined centrally by plan.

## Anti-Bypass Rules

- do not trust client-submitted quota state
- do not let the client choose its own plan entitlements
- do not allow direct client writes to usage tables
