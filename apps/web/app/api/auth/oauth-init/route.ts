import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getRedis } from '@/lib/redis'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  // Rate limit: 5 attempts per IP per hour
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'
    const hour = Math.floor(Date.now() / 3_600_000)
    const hashedIp = createHash('sha256').update(ip).digest('hex').slice(0, 16)
    const rateLimitKey = `oauth-init:${hashedIp}:${hour}`   // distinct key from old register route
    const redis = getRedis()
    const attempts = await redis.incr(rateLimitKey)
    if (attempts === 1) await redis.expire(rateLimitKey, 3600)
    if (attempts > 5) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }
  } catch (err) {
    console.error('[oauth-init] Redis rate-limit check failed, continuing:', err instanceof Error ? err.message : err)
  }

  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  // Check if invite mode is required
  const [{ data: setting }, { count }] = await Promise.all([
    supabaseAdmin.from('site_settings').select('value').eq('key', 'registration_mode').single(),
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
  ])
  const needsCode = setting?.value === 'invite' || (count ?? 0) >= 50

  if (needsCode) {
    const code = body.code?.trim().toUpperCase()
    if (!code) {
      return NextResponse.json({ error: 'Invite code is required' }, { status: 400 })
    }
    const { data: inviteCode } = await supabaseAdmin
      .from('invite_codes')
      .select('id, code, used_by')
      .eq('code', code)
      .is('used_by', null)
      .maybeSingle()
    if (!inviteCode) {
      return NextResponse.json({ error: 'Invalid or already used invite code' }, { status: 400 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set('invite_code', code, {
      httpOnly: true,
      secure: true,
      path: '/auth/callback',
      maxAge: 900,
      sameSite: 'none',    // Must survive Google OAuth cross-site redirect
    })
    return response
  }

  return NextResponse.json({ ok: true })
}
