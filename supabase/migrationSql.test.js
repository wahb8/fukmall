import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('schema migration SQL', () => {
  it('clears only uploaded_assets.chat_id when a referenced chat is deleted', () => {
    const migrationSql = readFileSync(
      resolve(cwd(), 'supabase/migrations/20260503190500_chat_delete_asset_fk_cleanup.sql'),
      'utf8',
    )

    expect(migrationSql).toContain('drop constraint if exists uploaded_assets_chat_fk')
    expect(migrationSql).toMatch(/foreign key\s*\(\s*chat_id\s*,\s*user_id\s*\)/i)
    expect(migrationSql).toMatch(/references public\.chats\s*\(\s*id\s*,\s*user_id\s*\)/i)
    expect(migrationSql).toMatch(/on delete set null\s*\(\s*chat_id\s*\)/i)
  })

  it('clears nullable generated-post and job pointers during related record cleanup', () => {
    const migrationSql = readFileSync(
      resolve(cwd(), 'supabase/migrations/20260503192500_chat_delete_related_fk_cleanup.sql'),
      'utf8',
    )

    expect(migrationSql).toMatch(/drop constraint if exists generated_posts_source_message_fk/i)
    expect(migrationSql).toMatch(/foreign key\s*\(\s*source_message_id\s*,\s*user_id\s*\)\s*references public\.chat_messages\s*\(\s*id\s*,\s*user_id\s*\)\s*on delete set null\s*\(\s*source_message_id\s*\)/i)
    expect(migrationSql).toMatch(/drop constraint if exists generated_posts_previous_post_fk/i)
    expect(migrationSql).toMatch(/foreign key\s*\(\s*previous_post_id\s*,\s*user_id\s*\)\s*references public\.generated_posts\s*\(\s*id\s*,\s*user_id\s*\)\s*on delete set null\s*\(\s*previous_post_id\s*\)/i)
    expect(migrationSql).toMatch(/drop constraint if exists generation_jobs_source_message_fk/i)
    expect(migrationSql).toMatch(/foreign key\s*\(\s*source_message_id\s*,\s*user_id\s*\)\s*references public\.chat_messages\s*\(\s*id\s*,\s*user_id\s*\)\s*on delete set null\s*\(\s*source_message_id\s*\)/i)
    expect(migrationSql).toMatch(/drop constraint if exists generation_jobs_output_post_fk/i)
    expect(migrationSql).toMatch(/foreign key\s*\(\s*output_post_id\s*,\s*user_id\s*\)\s*references public\.generated_posts\s*\(\s*id\s*,\s*user_id\s*\)\s*on delete set null\s*\(\s*output_post_id\s*\)/i)
  })
})
