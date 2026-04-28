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

## Enforcement Model

Usage enforcement should happen before expensive operations.

Recommended flow:

1. resolve active subscription tier
2. resolve current billing/usage period
3. compare requested action to allowed limits
4. reject early if limit is exceeded
5. perform the expensive operation
6. record usage event and update counters

## Reliability Rules

- usage events should be append-only
- summary counters should be derived from or backed by event records
- failed or rejected requests should not consume successful-generation quota unless explicitly intended
- Edge Functions, not the client, must write usage records

## Suggested Limit Types

- monthly generations
- monthly edits
- storage quota

These limits should be defined centrally by plan.

## Anti-Bypass Rules

- do not trust client-submitted quota state
- do not let the client choose its own plan entitlements
- do not allow direct client writes to usage tables
