import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveIdeaPoolForSheet } from '@/lib/envelope-idea-pool'
import { createAIProvider } from '@drop-note/shared'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// One AI call max, same budget shape as /api/envelopes/generate (DRO-197).
export const maxDuration = 60
export const runtime = 'nodejs'

// GET /api/envelopes/ideas
// Returns the Mood Sheet's chip pool (DRO-302): the caller's stored
// personalized idea pool if present and fresh, a lazily (re)generated one if
// it's missing/stale, or the 4 static starter chips as a fallback — see
// resolveIdeaPoolForSheet for the full precedence. Never 500s on a
// generation failure; that's a fallback case, not an error case.
async function handleGET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    const provider = createAIProvider()
    const resolved = await resolveIdeaPoolForSheet(supabase, provider, user.id)
    return NextResponse.json(resolved)
  } catch (err) {
    log.error('envelope_idea_pool.get_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withRouteLogging('GET /api/envelopes/ideas', handleGET)
