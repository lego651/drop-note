export type Tier = 'free' | 'pro' | 'power'

/** Max stored items per tier (active items, deleted_at IS NULL) */
export const TIER_ITEM_LIMITS = {
  free: 20,
  pro: 100,
  power: 500,
} as const satisfies Record<Tier, number>

/** Max attachment size per tier in MB */
export const TIER_ATTACHMENT_SIZE_MB = {
  free: 10,
  pro: 25,
  power: 50,
} as const satisfies Record<Tier, number>

/** Free tier monthly save action limit */
export const SAVE_ACTIONS_FREE_LIMIT = 30

/**
 * Returns true if the incoming email would push the user over their item cap.
 *
 * @param currentCount - Active items already in DB (deleted_at IS NULL)
 * @param incomingCount - Items this email would create (1 body + valid attachments, oversized excluded)
 * @param tier - User's current tier
 */
export function isOverItemCap(currentCount: number, incomingCount: number, tier: Tier): boolean {
  return currentCount + incomingCount > TIER_ITEM_LIMITS[tier]
}

/**
 * Returns true if processing this email would exceed the free tier monthly save limit.
 * Only applies to free tier — callers should skip this check for paid tiers.
 *
 * @param currentMonthCount - Save actions already used this month (from Redis)
 * @param incomingCount - Items this email would create
 */
export function isOverSaveLimit(currentMonthCount: number, incomingCount: number): boolean {
  return currentMonthCount + incomingCount > SAVE_ACTIONS_FREE_LIMIT
}

/**
 * Returns the current month as 'YYYY-MM' for use as a Redis key segment.
 * Pure function — testable without mocking Date.
 */
export function getCurrentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7)
}

/** MIME types accepted for attachment processing (ingest counting + worker processing) */
export const ALLOWED_ATTACHMENT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
])

/**
 * Returns true if the MIME type is allowed for attachment processing.
 * Allows all text/* types plus the explicit ALLOWED_ATTACHMENT_MIMES set.
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || ALLOWED_ATTACHMENT_MIMES.has(mimeType)
}
