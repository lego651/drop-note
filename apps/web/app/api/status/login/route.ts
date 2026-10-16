import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { incrementCounter } from '@/lib/counters'
import { STATUS_COOKIE, SESSION_TTL_MS, getOpsSecret, signSession, verifyAccessCode } from '@/lib/health/access'
import { log, withRouteLogging } from '@/lib/observability/logger'

export const runtime = 'nodejs'

const MAX_ATTEMPTS = 10
const WINDOW_SECONDS = 15 * 60

// POST /api/status/login — body { code } → sets the /status session cookie.
async function handlePOST(request: Request) {
  // Rate limit: 10 attempts per IP per 15 minutes.
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
    const window = Math.floor(Date.now() / (WINDOW_SECONDS * 1000))
    const key = `status-login:${createHash('sha256').update(ip).digest('hex').slice(0, 16)}:${window}`
    const attempts = await incrementCounter(key, WINDOW_SECONDS)
    if (attempts > MAX_ATTEMPTS) {
      log.warn('status.login.rate_limited')
      return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 })
    }
  } catch (err) {
    log.error('status.login.rate_limit_counter_failed', err, { action: 'continued' })
  }

  let code = ''
  try {
    const body = (await request.json()) as { code?: unknown }
    code = typeof body.code === 'string' ? body.code : ''
  } catch {
    code = ''
  }
  if (!code || code.length > 200) return NextResponse.json({ error: 'Access code required' }, { status: 400 })

  const stored = await getOpsSecret('status_password_hash')
  if (!stored) {
    log.error('status.login.not_configured', new Error('status_password_hash is not set in ops_secrets'))
    return NextResponse.json({ error: 'Status page is not configured' }, { status: 503 })
  }
  if (!verifyAccessCode(code, stored)) {
    log.warn('status.login.wrong_code')
    return NextResponse.json({ error: 'Wrong access code' }, { status: 401 })
  }

  log.info('status.login.ok')
  const res = NextResponse.json({ ok: true })
  res.cookies.set(STATUS_COOKIE, signSession(stored), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
  return res
}

export const POST = withRouteLogging('POST /api/status/login', handlePOST)
