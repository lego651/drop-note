import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Access control for /status: a shared access code (not a user account).
// The code is stored only as an scrypt hash in public.ops_secrets ('status_password_hash');
// a successful login sets an HMAC-signed, httpOnly session cookie.

export const STATUS_COOKIE = 'dn_status'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

/** Format: scrypt$N$r$p$<salt b64>$<hash b64> */
export function hashAccessCode(code: string, salt: Buffer = randomBytes(16)): string {
  const hash = scryptSync(code, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$')
}

export function verifyAccessCode(code: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, hashB64] = parts
  const expected = Buffer.from(hashB64, 'base64')
  const actual = scryptSync(code, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p),
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Session key is derived from the stored hash, so changing the access code
// invalidates every existing session.
function sessionKey(storedHash: string): Buffer {
  return createHash('sha256').update(`status-session:${storedHash}`).digest()
}

export function signSession(storedHash: string, now = Date.now()): string {
  const exp = String(now + SESSION_TTL_MS)
  const sig = createHmac('sha256', sessionKey(storedHash)).update(exp).digest('base64url')
  return `${exp}.${sig}`
}

export function verifySession(cookie: string | undefined, storedHash: string, now = Date.now()): boolean {
  if (!cookie) return false
  const [exp, sig] = cookie.split('.')
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false
  const expected = createHmac('sha256', sessionKey(storedHash)).update(exp).digest()
  const actual = Buffer.from(sig, 'base64url')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function getOpsSecret(key: 'status_password_hash' | 'health_check_token'): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('ops_secrets').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(`ops_secrets read failed: ${error.message}`)
  return data?.value ?? null
}

/** True when the request carries a valid /status session cookie. */
export async function hasStatusSession(cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false
  const stored = await getOpsSecret('status_password_hash')
  return stored ? verifySession(cookie, stored) : false
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
