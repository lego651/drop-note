import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * There's no local Postgres in CI to run this migration against, so this is a
 * structural contract test: it asserts the SQL file actually contains the guardrails
 * the PR claims (RLS, the cap-15 trigger, the single-"Other"-per-user constraint, the
 * items.category_id/category_locked columns) rather than running them. Real behaviour is
 * exercised by the application-level tests in apps/web/lib/__tests__/categories.test.ts
 * and apps/web/lib/ingest/__tests__/db.test.ts; those mock the DB and encode the same
 * contracts (e.g. "Other" undeletable, lock respected) that the live schema here is
 * supposed to support once the board applies it.
 */
const sql = readFileSync(
  join(__dirname, '../20261017000001_categories.sql'),
  'utf-8',
)

describe('20261017000001_categories.sql', () => {
  it('enables RLS on the categories table', () => {
    expect(sql).toMatch(/ALTER TABLE public\.categories ENABLE ROW LEVEL SECURITY/)
  })

  it('defines a select-own policy scoped to auth.uid() = user_id', () => {
    expect(sql).toMatch(/ON public\.categories FOR SELECT/)
    expect(sql).toMatch(/auth\.uid\(\) = user_id/)
  })

  it('does NOT grant authenticated users insert/update/delete on categories (writes go through supabaseAdmin; this is what actually protects "Other" from direct PostgREST access)', () => {
    for (const action of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(sql).not.toMatch(new RegExp(`ON public\\.categories FOR ${action}`))
    }
  })

  it('enforces a case-insensitive unique category name per user', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX categories_user_id_name_lower_idx ON public\.categories\(user_id, lower\(name\)\)/)
  })

  it('enforces at most one "Other" category per user', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX categories_user_id_is_other_idx ON public\.categories\(user_id\) WHERE is_other/)
  })

  it('caps categories at 15 per user via an insert-only trigger', () => {
    expect(sql).toMatch(/COUNT\(\*\) FROM public\.categories WHERE user_id = NEW\.user_id\) >= 15/)
    expect(sql).toMatch(/BEFORE INSERT ON public\.categories/)
  })

  it('adds category_id (RESTRICT) and category_locked to items', () => {
    expect(sql).toMatch(/ADD COLUMN category_id uuid REFERENCES public\.categories\(id\) ON DELETE RESTRICT/)
    expect(sql).toMatch(/ADD COLUMN category_locked boolean NOT NULL DEFAULT false/)
  })

  it('seeds the 8 default categories, marking exactly one as is_other', () => {
    const defaults = [
      'Food & Drink',
      'Health & Fitness',
      'Tech',
      'Entertainment',
      'Sports',
      'Home & DIY',
      'Learning & Work',
      'Other',
    ]
    for (const name of defaults) {
      expect(sql).toContain(`'${name}'`)
    }
    // Seed block (existing users) + handle_new_user (new signups) each mark is_other
    // true exactly once, for the 'Other' row only.
    expect(sql.match(/is_other\)\s*\n?\s*VALUES|\(d\.name = 'Other'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
    expect(sql).toMatch(/\(NEW\.id, 'Other', 7, true, true\)/)
  })

  it('updates handle_new_user to seed categories for new signups without dropping the users insert', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_new_user/)
    expect(sql).toMatch(/INSERT INTO public\.users \(id, email, drop_token\)/)
    expect(sql).toMatch(/INSERT INTO public\.categories \(user_id, name, position, is_default, is_other\)/)
  })

  it('updates search_items to also match on category name', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION search_items\(query text\)/)
    expect(sql).toMatch(/LEFT JOIN categories c ON c\.id = i\.category_id/)
    expect(sql).toMatch(/LOWER\(c\.name\) LIKE LOWER\('%' \|\| query \|\| '%'\)/)
  })

  it('does NOT add a DB-level DELETE trigger blocking "Other" (that guardrail lives in app code, see lib/categories.ts)', () => {
    expect(sql).not.toMatch(/BEFORE DELETE ON public\.categories/)
  })
})
