/**
 * Design token system for drop-note
 *
 * Single source of truth for all dynamic colors in the redesign.
 * CSS variable values live in globals.css — change them there and every
 * component that references these tokens updates automatically.
 *
 * Usage:
 *   <span style={{ color: `hsl(${colorForTag(tag.name)})` }}>
 *   <span style={{ backgroundColor: SOURCE_DOT['youtube'] }}>
 */

// ---------------------------------------------------------------------------
// Tag color palette
// hash(tag.name) % TAG_PALETTE.length → index → CSS variable name
// ---------------------------------------------------------------------------

export const TAG_PALETTE = [
  'var(--color-tag-blue)',
  'var(--color-tag-purple)',
  'var(--color-tag-pink)',
  'var(--color-tag-green)',
  'var(--color-tag-yellow)',
  'var(--color-tag-orange)',
  'var(--color-tag-teal)',
  'var(--color-tag-indigo)',
] as const

/**
 * Returns a deterministic CSS variable string for a tag name.
 * Same name always returns the same variable. Zero DB round-trips.
 * Use this for backgrounds/borders that wrap hsl() themselves.
 */
export function colorForTag(name: string): string {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return TAG_PALETTE[hash % TAG_PALETTE.length]
}

// ---------------------------------------------------------------------------
// Tag palette as raw HSL values (for hsl(... / 0.12) opacity syntax)
// Must stay in sync with TAG_PALETTE order and globals.css --color-tag-* values
// ---------------------------------------------------------------------------

export const TAG_PALETTE_HSL = [
  '214 89% 52%',
  '270 60% 55%',
  '330 70% 55%',
  '142 55% 42%',
  '45 90% 45%',
  '25 85% 50%',
  '180 55% 40%',
  '245 65% 52%',
] as const

/**
 * Returns raw HSL numbers (e.g. "214 89% 52%") for use in hsl(... / opacity) syntax.
 * Use this when you need: `hsl(${colorForTagHsl(name)} / 0.12)`
 */
export function colorForTagHsl(name: string): string {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return TAG_PALETTE_HSL[hash % TAG_PALETTE_HSL.length]
}

// ---------------------------------------------------------------------------
// Source type dot colors
// ---------------------------------------------------------------------------

export const SOURCE_DOT: Record<string, string> = {
  email: 'hsl(var(--color-source-email))',
  youtube: 'hsl(var(--color-source-youtube))',
  article: 'hsl(var(--color-source-article))',
  note: 'hsl(var(--color-source-note))',
  default: 'hsl(var(--color-source-default))',
}

// ---------------------------------------------------------------------------
// Status dot colors (AI processing pipeline state)
// ---------------------------------------------------------------------------

export const STATUS_DOT: Record<string, string> = {
  done: 'var(--color-status-done)',
  processing: 'var(--color-status-processing)',
  pending: 'var(--color-status-processing)', // pending and processing share one color
  failed: 'var(--color-status-failed)',
}

// ---------------------------------------------------------------------------
// Stat card accent icon colors
// ---------------------------------------------------------------------------

export const STAT_CARD_ACCENT = {
  totalSaved: 'var(--color-stat-total)',
  thisWeek: 'var(--color-stat-week)',
  processing: 'var(--color-stat-processing)',
  topTag: 'var(--color-stat-tag)',
} as const
