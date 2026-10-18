// DRO-141: the sync pipeline (D11) has no retry, so a pending/processing item can get
// orphaned forever (timeout, crash, unretried AI error). Age-cap the processing count so
// it only reflects items actually in flight, not months-old stuck rows.
export const PROCESSING_WINDOW_MINUTES = 15

export function getProcessingCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - PROCESSING_WINDOW_MINUTES * 60 * 1000).toISOString()
}
