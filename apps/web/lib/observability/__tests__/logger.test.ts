import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import * as Sentry from '@sentry/nextjs'
import { log, sanitize, setLogSinkForTests, setLogUser, getCorrelationId, withRouteLogging, type LogRow } from '../logger'
import { CORRELATION_HEADER, resolveCorrelationId } from '../correlation'

let written: LogRow[] = []

beforeEach(() => {
  written = []
  setLogSinkForTests(async (rows) => {
    written.push(...rows)
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(Sentry.captureException).mockClear()
})

afterEach(() => {
  setLogSinkForTests(null)
  vi.restoreAllMocks()
})

describe('resolveCorrelationId', () => {
  it('keeps a well-formed incoming id', () => {
    expect(resolveCorrelationId('abc12345-req')).toBe('abc12345-req')
  })

  it('mints a uuid when the header is missing, too short, or contains unsafe characters', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    expect(resolveCorrelationId(null)).toMatch(uuid)
    expect(resolveCorrelationId('short')).toMatch(uuid)
    expect(resolveCorrelationId('bad id\n{"level":"info"}')).toMatch(uuid)
  })
})

describe('sanitize', () => {
  it('redacts PII and secret keys but keeps metrics', () => {
    expect(
      sanitize({ email: 'a@b.com', sender_email: 'x', api_key: 'k', text_length: 12, userId: 'u1' }),
    ).toEqual({ email: '[redacted]', sender_email: '[redacted]', api_key: '[redacted]', text_length: 12, userId: 'u1' })
  })

  it('truncates long strings and deep objects', () => {
    const out = sanitize({ s: 'x'.repeat(600), a: { b: { c: { d: 1 } } } }) as Record<string, unknown>
    expect((out.s as string).length).toBe(501)
    expect(out.a).toEqual({ b: { c: '[truncated]' } })
  })
})

describe('withRouteLogging', () => {
  function req(headers: Record<string, string> = {}) {
    return new Request('https://dropnote.me/api/x', { method: 'POST', headers })
  }

  it('reuses the incoming correlation id, returns it as a header, and writes a request row', async () => {
    const handler = withRouteLogging('POST /api/x', async () => {
      setLogUser('user-1')
      log.info('x.did_thing', { count: 2 })
      return Response.json({ ok: true }, { status: 201 })
    })

    const res = await handler(req({ [CORRELATION_HEADER]: 'corr-12345678' }))

    expect(res.status).toBe(201)
    expect(res.headers.get(CORRELATION_HEADER)).toBe('corr-12345678')
    expect(written).toHaveLength(2)
    expect(written[0]).toMatchObject({
      kind: 'request', event: 'request.completed', route: 'POST /api/x', method: 'POST',
      status: 201, level: 'info', correlation_id: 'corr-12345678', user_id: 'user-1',
    })
    expect(written[1]).toMatchObject({
      kind: 'event', event: 'x.did_thing', correlation_id: 'corr-12345678', meta: { count: 2 },
    })
  })

  it('turns a thrown error into a 500 with the correlation id, and reports it to Sentry', async () => {
    const handler = withRouteLogging('POST /api/x', async () => {
      throw new Error('boom')
    })

    const res = await handler(req())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.correlationId).toBe(res.headers.get(CORRELATION_HEADER))
    expect(written[0]).toMatchObject({ kind: 'request', status: 500, level: 'error' })
    expect(written[1]).toMatchObject({ event: 'request.unhandled_error', level: 'error', message: 'boom' })
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ correlation_id: body.correlationId }) }),
    )
  })

  it('logs 4xx responses at warn level', async () => {
    const res = await withRouteLogging('GET /api/x', async () => Response.json({}, { status: 401 }))(req())
    expect(res.status).toBe(401)
    expect(written[0]).toMatchObject({ level: 'warn', status: 401 })
  })

  it('exposes the correlation id to code inside the request', async () => {
    let seen: string | null = null
    await withRouteLogging('GET /api/x', async () => {
      seen = getCorrelationId()
      return Response.json({})
    })(req({ [CORRELATION_HEADER]: 'corr-abcdefgh' }))
    expect(seen).toBe('corr-abcdefgh')
    expect(getCorrelationId()).toBeNull()
  })

  it('persists events from fire-and-forget work that finishes after the response', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    let late!: Promise<void>
    await withRouteLogging('POST /api/x', async () => {
      setLogUser('user-1')
      late = gate.then(() => log.warn('x.late_failure', { n: 1 }))
      return Response.json({ ok: true })
    })(req({ [CORRELATION_HEADER]: 'corr-late0001' }))

    expect(written).toHaveLength(1)
    release()
    await late
    await new Promise((r) => setTimeout(r, 0))
    expect(written[1]).toMatchObject({
      kind: 'event', event: 'x.late_failure', correlation_id: 'corr-late0001', user_id: 'user-1',
    })
  })

  it('still answers when the log sink fails', async () => {
    setLogSinkForTests(async () => {
      throw new Error('db down')
    })
    const res = await withRouteLogging('GET /api/x', async () => Response.json({ ok: true }))(req())
    expect(res.status).toBe(200)
  })
})

describe('log outside a request', () => {
  it('writes the event immediately with no correlation id', async () => {
    log.warn('cron.something', { n: 1 })
    await new Promise((r) => setTimeout(r, 0))
    expect(written[0]).toMatchObject({ kind: 'event', event: 'cron.something', level: 'warn', correlation_id: null })
  })
})
