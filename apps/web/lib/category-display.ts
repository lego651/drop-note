// Client-safe category helpers shared between server pages and client
// components (sidebar, badges, pickers). Keep this free of server-only
// imports (no supabaseAdmin, no AI provider) so client components can
// import it directly.

export const CATEGORY_CAP = 15
export const CATEGORY_NAME_MAX_LENGTH = 40

export type CategoryLite = {
  id: string
  name: string
  position: number
  hidden: boolean
  is_default: boolean
  is_other: boolean
}

/**
 * Display order used everywhere categories are listed (sidebar, pickers,
 * chips): by position, with "Other" always last regardless of its position.
 */
export function sortCategoriesForDisplay<T extends { position: number; is_other: boolean }>(
  categories: T[],
): T[] {
  return [...categories].sort((a, b) => {
    if (a.is_other !== b.is_other) return Number(a.is_other) - Number(b.is_other)
    return a.position - b.position
  })
}
