import { AsyncLocalStorage } from 'node:async_hooks'
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import type { Json } from '@drop-note/shared'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { CORRELATION_HEADER, resolveCorrelationId } from './correlation'

// Structured logging for API routes.
//
// Every log line is one JSON object on stdout (visible in Vercel runtime logs) and
// is also persisted to public.request_logs so it can be queried by correlation id
// after Vercel's short log retention expires. Errors are additionally sent to Sentry
// tagged with the correlation id.

export type LogLevel = 'info' | 'warn' | 'error'
export type LogMeta = Record<string, unknown>

export interface LogRow {
  correlation_id: string | null
  kind: 'request' | 'event'
  level: LogLevel
  event: string
  route: string | null
  method: string | null
  status: number | null
  duration_ms: number | null
  user_id: string | null
  message: string | null
  meta: Json
}

interface RequestContext {
  correlationId: string
  route: string
  method: string
  userId: string | null
  events: LogRow[]
  /** Set once the request's rows are written; later events (fire-and-forget work) persist on their own. */
  flushed: boolean
}

const storage = new AsyncLocalStorage<RequestContext>()

// ---------------------------------------------------------------------------
// Redaction: never persist PII or secrets. Keys are matched case-insensitively.
// ---------------------------------------------------------------------------

const REDACTED_KEYS = new Set([
  'email', 'from', 'to', 'subject', 'name',
  'token', 'password', 'secret', 'authorization', 'cookie', 'apikey', 'api_key',
  'body', 'html', 'text', 'content', 'code',
])
const REDACTED_SUFFIXES = ['_email', '_token', '_secret', '_password', '_key']
const MAX_STRING = 500
const MAX_DEPTH = 3

function shouldRedact(key: string): boolean {
  const k = key.toLowerCase()
  return REDACTED_KEYS.has(k) || REDACTED_SUFFIXES.some((s) => k.endsWith(s))
}

export function sanitize(value: unknown, depth = 0): Json {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'boolean') return value
  if (value instanceof Error) return { name: value.name, message: sanitize(value.message, depth + 1) }
  if (depth >= MAX_DEPTH) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, Json> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shouldRedact(k) ? '[redacted]' : sanitize(v, depth + 1)
    }
    return out
  }
  return String(value)
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message
  return String(err)
}

// ---------------------------------------------------------------------------
// Sink: where rows are persisted. Swappable in tests.
// ---------------------------------------------------------------------------

type LogSink = (rows: LogRow[]) => Promise<void>

const PERSIST_TIMEOUT_MS = 400

const supabaseSink: LogSink = async (rows) => {
  if (process.env.REQUEST_LOGS_ENABLED === 'false') return
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const insert = supabaseAdmin.from('request_logs').insert(rows)
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), PERSIST_TIMEOUT_MS))
  const result = await Promise.race([insert, timeout])
  if (result === 'timeout') {
    console.warn(JSON.stringify({ level: 'warn', event: 'request_logs.write_timeout', rows: rows.length }))
  } else if (result.error) {
    console.warn(JSON.stringify({ level: 'warn', event: 'request_logs.write_failed', message: result.error.message }))
  }
}

let sink: LogSink = supabaseSink

export function setLogSinkForTests(next: LogSink | null): void {
  sink = next ?? supabaseSink
}

async function persist(rows: LogRow[]): Promise<void> {
  if (rows.length === 0) return
  try {
    await sink(rows)
  } catch (err) {
    console.warn(JSON.stringify({ level: 'warn', event: 'request_logs.write_failed', message: errorMessage(err) }))
  }
}

// ---------------------------------------------------------------------------
// Public logging API
// ---------------------------------------------------------------------------

function emit(level: LogLevel, event: string, meta: LogMeta, err?: unknown): void {
  const ctx = storage.getStore()
  const safeMeta = sanitize(meta) as Record<string, Json>
  const message = err === undefined ? null : errorMessage(err).slice(0, MAX_STRING)

  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    correlationId: ctx?.correlationId ?? null,
    route: ctx?.route ?? null,
    ...safeMeta,
    ...(message ? { error: message } : {}),
  }
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  out(JSON.stringify(line))

  if (level === 'error' && err !== undefined) {
    Sentry.captureException(err instanceof Error ? err : new Error(message ?? event), {
      tags: { correlation_id: ctx?.correlationId ?? 'none', route: ctx?.route ?? 'none', event },
    })
  }

  const row: LogRow = {
    correlation_id: ctx?.correlationId ?? null,
    kind: 'event',
    level,
    event,
    route: ctx?.route ?? null,
    method: ctx?.method ?? null,
    status: null,
    duration_ms: null,
    user_id: ctx?.userId ?? null,
    message,
    meta: safeMeta,
  }
  // Inside a request: flushed together with the request row. Outside, or after the
  // request already flushed (e.g. a .catch on un-awaited work): written now.
  if (ctx && !ctx.flushed) ctx.events.push(row)
  else void persist([row])
}

export const log = {
  info(event: string, meta: LogMeta = {}): void {
    emit('info', event, meta)
  },
  warn(event: string, meta: LogMeta = {}, err?: unknown): void {
    emit('warn', event, meta, err)
  },
  error(event: string, err: unknown, meta: LogMeta = {}): void {
    emit('error', event, meta, err)
  },
}

/** Attach the authenticated user to the current request's logs. */
export function setLogUser(userId: string | null | undefined): void {
  const ctx = storage.getStore()
  if (ctx && userId) ctx.userId = userId
}

/** Correlation id of the current request, if called inside withRouteLogging. */
export function getCorrelationId(): string | null {
  return storage.getStore()?.correlationId ?? null
}

// ---------------------------------------------------------------------------
// Route wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a route handler so every call gets a correlation id, a `request.completed`
 * log row (status + duration), the `x-correlation-id` response header, and a safe
 * 500 response if the handler throws.
 *
 *   export const GET = withRouteLogging('GET /api/items/search', handleGet)
 */
export function withRouteLogging<Args extends [Request, ...unknown[]]>(
  route: string,
  handler: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const request = args[0]
    const ctx: RequestContext = {
      correlationId: resolveCorrelationId(request.headers.get(CORRELATION_HEADER)),
      route,
      method: request.method,
      userId: null,
      events: [],
      flushed: false,
    }
    const start = Date.now()

    return storage.run(ctx, async () => {
      let response: Response
      try {
        response = await handler(...args)
      } catch (err) {
        emit('error', 'request.unhandled_error', {}, err)
        response = NextResponse.json(
          { error: 'Internal server error', correlationId: ctx.correlationId },
          { status: 500 },
        )
      }

      try {
        response.headers.set(CORRELATION_HEADER, ctx.correlationId)
      } catch {
        // Some responses (e.g. Response.redirect) have immutable headers.
      }

      const durationMs = Date.now() - start
      const level: LogLevel = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info'
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level,
        event: 'request.completed',
        correlationId: ctx.correlationId,
        route,
        status: response.status,
        duration_ms: durationMs,
      }))

      ctx.flushed = true
      await persist([
        {
          correlation_id: ctx.correlationId,
          kind: 'request',
          level,
          event: 'request.completed',
          route,
          method: ctx.method,
          status: response.status,
          duration_ms: durationMs,
          user_id: ctx.userId,
          message: null,
          meta: {},
        },
        ...ctx.events,
      ])

      return response
    })
  }
}
