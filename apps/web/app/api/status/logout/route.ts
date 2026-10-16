import { NextResponse } from 'next/server'
import { STATUS_COOKIE } from '@/lib/health/access'
import { withRouteLogging } from '@/lib/observability/logger'

// POST /api/status/logout — clears the /status session cookie.
async function handlePOST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(STATUS_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 })
  return res
}

export const POST = withRouteLogging('POST /api/status/logout', handlePOST)
