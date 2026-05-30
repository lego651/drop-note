import type { SortOption } from '@/components/items/SortDropdown'

/**
 * Applies the correct ORDER BY clauses to a Supabase query builder based on the
 * active sort option.
 *
 * - 'newest': strict created_at DESC — no pinned-first
 * - 'oldest': strict created_at ASC  — no pinned-first
 * - 'pinned': pinned DESC, then created_at DESC within each group
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applySortOrder<T extends { order: (column: string, options?: { ascending?: boolean }) => T }>(
  query: T,
  activeSort: SortOption,
): T {
  if (activeSort === 'pinned') {
    return query
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
  }
  return query.order('created_at', { ascending: activeSort === 'oldest' })
}
