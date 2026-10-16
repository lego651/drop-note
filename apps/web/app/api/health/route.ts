import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { withRouteLogging } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'

// GET /api/health — public liveness probe for external uptime monitors.
// Returns only ok/down (no component details): 200 when the app and database answer.
async function handleGET() {
  const { error } = await supabaseAdmin.from('site_settings').select('key').limit(1)
  if (error) return NextResponse.json({ status: 'down' }, { status: 503 })
  return NextResponse.json({ status: 'ok' })
}

export const GET = withRouteLogging('GET /api/health', handleGET)
