import { randomUUID } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { runHealthChecks } from '@/lib/health/checks'
import { STATUS_COOKIE, getOpsSecret, hasStatusSession, safeEqual } from '@/lib/health/access'
import { log, withRouteLogging } from '@/lib/observability/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/health/run
// Runs every synthetic check and stores the results in health_checks.
// Called every 5 minutes by Supabase pg_cron (Bearer health_check_token), or from
// the "Run checks now" button on /status (session cookie).
async function handlePOST(request: Request) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const token = bearer ? await getOpsSecret('health_check_token') : null
  const authorized =
    (token !== null && bearer.length > 0 && safeEqual(bearer, token)) ||
    (await hasStatusSession(cookies().get(STATUS_COOKIE)?.value))
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const origin = new URL(request.url).origin
  const runId = randomUUID()
  const results = await runHealthChecks(origin)

  const { error } = await supabaseAdmin
    .from('health_checks')
    .insert(results.map((r) => ({ ...r, run_id: runId })))
  if (error) {
    // Unstored results never reach /status, so the run must not look successful.
    log.error('health.store_failed', error, { runId })
    return NextResponse.json({ runId, error: 'Results could not be stored', results }, { status: 500 })
  }

  const down = results.filter((r) => r.status === 'down').map((r) => r.component)
  const degraded = results.filter((r) => r.status === 'degraded').map((r) => r.component)
  if (down.length > 0) log.error('health.components_down', new Error(`down: ${down.join(', ')}`), { runId, down, degraded })
  else if (degraded.length > 0) log.warn('health.components_degraded', { runId, degraded })
  else log.info('health.all_up', { runId })

  return NextResponse.json({ runId, results })
}

export const POST = withRouteLogging('POST /api/health/run', handlePOST)
