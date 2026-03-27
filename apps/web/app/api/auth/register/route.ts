import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getRedis } from '@/lib/redis'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  // Rate limit: 5 attempts per IP per hour
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'
    const hour = Math.floor(Date.now() / 3_600_000)
    const hashedIp = createHash('sha256').update(ip).digest('hex').slice(0, 16)
    const rateLimitKey = `register:${hashedIp}:${hour}`
    const redis = getRedis()
    const attempts = await redis.incr(rateLimitKey)
    if (attempts === 1) await redis.expire(rateLimitKey, 3600)
    if (attempts > 5) {
      return NextResponse.json({ error: 'Too many registration attempts. Try again later.' }, { status: 429 })
    }
  } catch (err) {
    console.error('[register] Redis rate-limit check failed, continuing:', err instanceof Error ? err.message : err)
    // fail open — don't block registration if Redis is unavailable
  }

  let body: { email?: string; code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  // Check site mode + user count
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
      .single()

    if (!inviteCode || inviteCode.used_by !== null) {
      return NextResponse.json({ error: 'Invalid or already used invite code' }, { status: 400 })
    }
  }

  // Send magic link via Supabase server client
  const supabase = await createClient()
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${new URL(request.url).origin}/auth/callback`,
    },
  })

  if (otpError) {
    console.error('[register] signInWithOtp error:', otpError.message)
    return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
  }

  const response = NextResponse.json({ ok: true })

  if (needsCode && body.code) {
    response.cookies.set('invite_code', body.code.trim().toUpperCase(), {
      httpOnly: true,
      path: '/auth/callback',
      maxAge: 900,
      sameSite: 'lax',
    })
  }

  return response
}
