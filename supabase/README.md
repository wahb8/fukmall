# Supabase Backend Scaffold

This directory is reserved for backend implementation.

Planned structure:

- `migrations/`: Postgres schema, indexes, triggers, and RLS policies
- `functions/`: Supabase Edge Functions
- `functions/_shared/`: shared server-side helpers

Environment handling:

- use `supabase/.env.development.example` as the template for development secrets
- use `supabase/.env.production.example` as the template for production secrets
- do not commit real keys or project secrets
