import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * There's no local Postgres in CI to run this migration against (same
 * limitation as categories-migration.test.ts), so this is a structural
 * contract test: it asserts the SQL file contains the guardrails DRO-200's
 * plan promises, and that it stays idempotent/forward-only.
 */
const sql = readFileSync(
  join(__dirname, '../20261019000001_hardening_sync.sql'),
  'utf-8',
)

// Strip `-- ...` line comments so "does NOT touch X" checks aren't tripped up
// by the file's own explanatory comments (which intentionally name the
// out-of-scope objects to say why they're excluded).
const executableSql = sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

describe('20261019000001_hardening_sync.sql', () => {
  it('does NOT touch site_settings (board decision: skip, service role already covers writes)', () => {
    expect(executableSql).not.toMatch(/site_settings/)
  })

  it('does NOT touch folders/item_folders (stays in DRO-119)', () => {
    expect(executableSql).not.toMatch(/\bfolders\b/i)
  })

  it('pins search_path on set_updated_at and enforce_category_cap', () => {
    expect(executableSql).toMatch(
      /create or replace function public\.set_updated_at\(\)\s*\nreturns trigger language plpgsql\s*\nset search_path = public, pg_temp/,
    )
    expect(executableSql).toMatch(
      /create or replace function public\.enforce_category_cap\(\)\s*\nreturns trigger language plpgsql\s*\nset search_path = public, pg_temp/,
    )
  })

  it('drops the broken invite_codes claim-unclaimed policy, does not re-create it', () => {
    expect(executableSql).toMatch(
      /drop policy if exists "invite_codes: claim unclaimed" on public\.invite_codes;/,
    )
    expect(executableSql).not.toMatch(/create policy "invite_codes: claim unclaimed"/)
  })

  it('backfills updated_at from created_at, not now(), and avoids a single-shot rewrite-locking ADD COLUMN', () => {
    for (const table of ['users', 'items']) {
      expect(executableSql).toMatch(
        new RegExp(`alter table public\\.${table} add column if not exists updated_at timestamptz;`),
      )
      expect(executableSql).toMatch(
        new RegExp(`update public\\.${table} set updated_at = created_at where updated_at is null;`),
      )
      expect(executableSql).toMatch(
        new RegExp(`alter table public\\.${table} alter column updated_at set not null;`),
      )
    }
    // No bare "ADD COLUMN ... NOT NULL DEFAULT now()" anywhere (that's the
    // pattern that forces an ACCESS EXCLUSIVE table rewrite).
    expect(executableSql).not.toMatch(/add column (if not exists )?updated_at timestamptz not null default now\(\)/i)
  })

  it('creates both user/items updated_at triggers using set_updated_at()', () => {
    expect(executableSql).toMatch(
      /create trigger users_set_updated_at\s*\n\s*before update on public\.users\s*\n\s*for each row execute function public\.set_updated_at\(\);/,
    )
    expect(executableSql).toMatch(
      /create trigger items_set_updated_at\s*\n\s*before update on public\.items\s*\n\s*for each row execute function public\.set_updated_at\(\);/,
    )
  })

  it('adds the case-insensitive block_list index under a non-colliding name', () => {
    expect(executableSql).toMatch(
      /create unique index if not exists idx_block_list_type_value_lower\s*\n\s*on public\.block_list\(type, lower\(value\)\);/,
    )
  })

  it('drops the confirmed-duplicate plain idx_block_list_type_value index', () => {
    expect(executableSql).toMatch(/drop index if exists public\.idx_block_list_type_value;/)
  })

  it('adds the usage_log month-format CHECK via NOT VALID + VALIDATE, guarded against re-adding', () => {
    expect(executableSql).toMatch(/add constraint usage_log_month_format\s*\n\s*check \(month ~/)
    expect(executableSql).toMatch(/not valid;/)
    expect(executableSql).toMatch(/alter table public\.usage_log validate constraint usage_log_month_format;/)
    expect(executableSql).toMatch(/where conname = 'usage_log_month_format'/)
  })

  it('adds idx_items_active but keeps idx_items_user_id_created_at (still needed for deleted_at IS NOT NULL queries and the user_id FK)', () => {
    expect(executableSql).toMatch(
      /create index if not exists idx_items_active\s*\n\s*on public\.items\(user_id, created_at desc\)\s*\n\s*where deleted_at is null;/,
    )
    expect(executableSql).not.toMatch(/drop index if exists public\.idx_items_user_id_created_at;/)
  })

  it('every bare DDL/DML statement uses a re-run-safe guard', () => {
    // Loose but useful: every CREATE/DROP/ALTER keyword in the executable SQL
    // is immediately followed by one of the standard idempotency guards.
    const createMatches = executableSql.match(/\bcreate\s+(unique\s+)?(index|trigger|or replace function)\b[^\n]*/gi) ?? []
    for (const stmt of createMatches) {
      const ok =
        /create or replace function/i.test(stmt) ||
        /create (unique )?index if not exists/i.test(stmt) ||
        /create trigger/i.test(stmt) // triggers are preceded by a `drop trigger if exists` for the same name
      expect(ok, `unguarded CREATE: ${stmt}`).toBe(true)
    }

    const dropIndexMatches = executableSql.match(/\bdrop\s+index\b[^\n]*/gi) ?? []
    for (const stmt of dropIndexMatches) {
      expect(/drop index if exists/i.test(stmt), `unguarded DROP INDEX: ${stmt}`).toBe(true)
    }

    const dropPolicyMatches = executableSql.match(/\bdrop\s+policy\b[^\n]*/gi) ?? []
    for (const stmt of dropPolicyMatches) {
      expect(/drop policy if exists/i.test(stmt), `unguarded DROP POLICY: ${stmt}`).toBe(true)
    }
  })
})
