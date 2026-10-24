import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { incrementCounter } from '@/lib/counters'
import {
  ENVELOPE_SUGGEST_RATE_LIMIT_PER_HOUR,
  fetchEnvelopeSuggestCandidates,
  runEnvelopeSuggestion,
} from '@/lib/envelopes'
import { createAIProvider, ENVELOPE_MIN_ITEMS, EnvelopeSuggestRequestSchema } from '@drop-note/shared'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// One AI call plus the SQL pre-filter's handful of lookups — same margin as
// /api/envelopes/generate (DRO-197) in case the provider call is slow.
export const maxDuration = 60
export const runtime = 'nodejs'

// POST /api/envelopes/suggest
// Body: { query: string (1-500 chars), seedTerms?: string[] }
async function handlePOST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    let rawBody: { query?: unknown; seedTerms?: unknown }
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = EnvelopeSuggestRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }
    const { query, seedTerms } = parsed.data

    // Separate from envelope_gen's budget (see ENVELOPE_SUGGEST_RATE_LIMIT_PER_HOUR) —
    // browsing mood chips must not eat into the plan-generation limit.
    let overRateLimit = false
    try {
      const count = await incrementCounter(`envelope_suggest:${user.id}`, 3600, {
        limit: ENVELOPE_SUGGEST_RATE_LIMIT_PER_HOUR,
      })
      overRateLimit = count === -1
    } catch (err) {
      log.error('envelopes.suggest_rate_limit_counter_failed', err, { action: 'allowed_through' })
    }
    if (overRateLimit) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
    }

    const candidates = await fetchEnvelopeSuggestCandidates(supabase, user.id, query, seedTerms ?? [])

    // Not enough to even ask the model for ENVELOPE_MIN_ITEMS picks — skip the AI
    // call entirely rather than spend a call on a pool too small to answer from.
    if (candidates.length < ENVELOPE_MIN_ITEMS) {
      return NextResponse.json({ items: [], candidateCount: candidates.length, insufficientMatches: true })
    }

    const provider = createAIProvider()
    const result = await runEnvelopeSuggestion(provider, candidates, query)
    if (result.status === 'failed') {
      log.error('envelopes.suggest_generation_failed', new Error(result.errorMessage))
      return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
    }

    const candidatesById = new Map(candidates.map((c) => [c.id, c]))
    const items = result.picks
      .map((pick) => {
        const candidate = candidatesById.get(pick.itemId)
        // Can't happen — runEnvelopeSuggestion already filtered picks down to this
        // candidate set — but a pick with no matching candidate has nothing to
        // build a response item from, so skip it defensively rather than crash.
        if (!candidate) return null
        return { itemId: pick.itemId, subject: candidate.subject ?? '', reason: pick.reason }
      })
      .filter((item): item is { itemId: string; subject: string; reason: string } => item !== null)

    return NextResponse.json({
      items,
      candidateCount: candidates.length,
      insufficientMatches: items.length < ENVELOPE_MIN_ITEMS,
    })
  } catch (err) {
    log.error('envelopes.suggest_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withRouteLogging('POST /api/envelopes/suggest', handlePOST)
