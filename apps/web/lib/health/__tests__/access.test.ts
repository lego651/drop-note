import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { hashAccessCode, verifyAccessCode, signSession, verifySession, safeEqual, SESSION_TTL_MS } from '../access'

describe('access code hashing', () => {
  const stored = hashAccessCode('correct horse')

  it('stores an scrypt hash, never the code', () => {
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
    expect(stored).not.toContain('correct horse')
  })

  it('verifies only the right code', () => {
    expect(verifyAccessCode('correct horse', stored)).toBe(true)
    expect(verifyAccessCode('correct horsE', stored)).toBe(false)
    expect(verifyAccessCode('', stored)).toBe(false)
  })

  it('rejects malformed stored values', () => {
    expect(verifyAccessCode('x', 'plaintext')).toBe(false)
    expect(verifyAccessCode('x', 'bcrypt$1$2$3$4$5')).toBe(false)
  })
})

describe('session cookie', () => {
  const stored = hashAccessCode('code-1')
  const now = 1_800_000_000_000

  it('accepts a fresh cookie signed with the current hash', () => {
    expect(verifySession(signSession(stored, now), stored, now + 1000)).toBe(true)
  })

  it('rejects expired, tampered, missing, or old-code cookies', () => {
    const cookie = signSession(stored, now)
    expect(verifySession(cookie, stored, now + SESSION_TTL_MS + 1)).toBe(false)
    const [exp, sig] = cookie.split('.')
    expect(verifySession(`${Number(exp) + 999999}.${sig}`, stored, now)).toBe(false)
    expect(verifySession(undefined, stored, now)).toBe(false)
    expect(verifySession('garbage', stored, now)).toBe(false)
    // Changing the access code invalidates existing sessions.
    expect(verifySession(cookie, hashAccessCode('code-2'), now)).toBe(false)
  })
})

describe('safeEqual', () => {
  it('compares tokens without length leaks throwing', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})
