/**
 * POST /api/envelopes/suggest contract (DRO-299/DRO-300, slice 1) as given to
 * this slice (DRO-301): `{ query, seedTerms? }` -> `{ items, candidateCount,
 * insufficientMatches }`. Kept local to the Mood Sheet rather than in
 * packages/shared so this slice doesn't collide with slice 1's own route +
 * schema landing in parallel; reconcile into one shared type once both merge.
 */
export interface EnvelopeSuggestItem {
  id: string
  subject: string | null
  reason: string
}

export interface EnvelopeSuggestResponse {
  items: EnvelopeSuggestItem[]
  candidateCount: number
  insufficientMatches: boolean
}
