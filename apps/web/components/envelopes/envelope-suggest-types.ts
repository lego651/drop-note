/**
 * POST /api/envelopes/suggest response shape (DRO-300, now on main):
 * `{ query, seedTerms? }` -> `{ items, candidateCount, insufficientMatches }`,
 * each item `{ itemId, subject, reason }`. Kept local rather than imported
 * from packages/shared since shared only exports the AI-provider-facing pick
 * schema (`itemId` + `reason`, no `subject`/`candidateCount`/`insufficientMatches`),
 * not this route's full HTTP response shape.
 */
export interface EnvelopeSuggestItem {
  itemId: string
  subject: string | null
  reason: string
}

export interface EnvelopeSuggestResponse {
  items: EnvelopeSuggestItem[]
  candidateCount: number
  insufficientMatches: boolean
}
