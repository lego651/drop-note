// DRO-142: the sync pipeline (D11) has no retry, so a pending/processing item can get
// orphaned forever (ingest timeout/crash, unretried AI error). This daily cron flips
// anything older than this window to a real `failed` status so it surfaces to the user
// instead of hanging silently.
export const STALE_WINDOW_HOURS = 24

export const STALE_ITEM_ERROR_MESSAGE = "Didn't finish processing — please re-send."

export function getStaleCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - STALE_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
}
