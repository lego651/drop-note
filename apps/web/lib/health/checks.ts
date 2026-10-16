import { supabaseAdmin } from '@/lib/supabase/admin'
import { getRedis } from '@/lib/redis'
import { HEALTH_CHECK_USER_AGENT } from '@/lib/observability/logger'

// Synthetic health checks shown on /status. Each check probes one user-facing
// capability the way a user (or our own server) would hit it, and classifies the
// result as up / degraded / down. Checks never mutate data and never sign in.

export type HealthStatus = 'up' | 'degraded' | 'down'

export interface ComponentDef {
  key: string
  name: string
  description: string
  /** Routes (as logged by withRouteLogging) whose real-user traffic belongs to this component. */
  routes: string[]
}

export interface CheckResult {
  component: string
  status: HealthStatus
  latency_ms: number
  detail: string
}

export const COMPONENTS: ComponentDef[] = [
  { key: 'website', name: 'Website', description: 'Landing page at dropnote.me loads.', routes: [] },
  {
    key: 'signin',
    name: 'Sign in (Google)',
    description: 'Login page loads and Supabase Auth has Google sign-in enabled.',
    routes: ['GET /auth/callback'],
  },
  {
    key: 'signup',
    name: 'Sign up',
    description: 'Register page loads and registration settings are readable.',
    routes: ['POST /api/auth/oauth-init'],
  },
  {
    key: 'dashboard_api',
    name: 'Dashboard & search API',
    description: 'Item APIs respond (an unauthenticated probe must get 401, not an error).',
    routes: [
      'GET /api/items/search', 'DELETE /api/items', 'PATCH /api/items/[id]', 'DELETE /api/items/[id]',
      'POST /api/items/[id]/restore', 'POST /api/items/bulk-tag', 'DELETE /api/items/trash',
    ],
  },
  {
    key: 'ingest',
    name: 'Email ingest',
    description: 'The SendGrid webhook endpoint (/api/ingest) is reachable.',
    routes: ['POST /api/ingest'],
  },
  { key: 'database', name: 'Database', description: 'Supabase Postgres answers a simple query.', routes: [] },
  { key: 'storage', name: 'File storage', description: 'Supabase Storage (attachments) answers.', routes: [] },
  { key: 'ai', name: 'AI summaries', description: 'The AI provider API accepts our key.', routes: [] },
  {
    key: 'email_sending',
    name: 'Outbound email',
    description: 'Resend (welcome / digest / limit emails) accepts our key.',
    routes: ['GET /api/cron/digest'],
  },
  { key: 'rate_limit', name: 'Rate limiting', description: 'Upstash Redis answers PING.', routes: [] },
]

const TIMEOUT_MS = 8000
/** Slower than this (but successful) = degraded. */
export const SLOW_MS = 3000

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Classify an HTTP probe: the status must be one of `expected`, and fast. */
export function classifyHttp(status: number, latencyMs: number, expected: number[]): HealthStatus {
  if (!expected.includes(status)) return 'down'
  return latencyMs > SLOW_MS ? 'degraded' : 'up'
}

/** Worst of several statuses (down > degraded > up). */
export function worst(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('down')) return 'down'
  if (statuses.includes('degraded')) return 'degraded'
  return 'up'
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

async function timed<T>(fn: () => PromiseLike<T>): Promise<{ value: T; ms: number }> {
  const start = Date.now()
  const value = await fn()
  return { value, ms: Date.now() - start }
}

async function probe(url: string, init: RequestInit = {}): Promise<{ status: number; ms: number; body: string }> {
  const { value, ms } = await timed(async () => {
    const res = await fetch(url, {
      ...init,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': HEALTH_CHECK_USER_AGENT, ...(init.headers ?? {}) },
    })
    return { status: res.status, body: await res.text() }
  })
  return { ...value, ms }
}

function result(component: string, status: HealthStatus, ms: number, detail: string): CheckResult {
  return { component, status, latency_ms: ms, detail: detail.slice(0, 300) }
}

async function checkPage(component: string, url: string): Promise<CheckResult> {
  const r = await probe(url)
  return result(component, classifyHttp(r.status, r.ms, [200]), r.ms, `GET ${new URL(url).pathname} → ${r.status}`)
}

async function checkSignin(origin: string): Promise<CheckResult> {
  const page = await probe(`${origin}/login`)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anon) return result('signin', 'down', page.ms, 'Supabase env vars missing')
  const auth = await probe(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: anon } })
  let googleEnabled = false
  try {
    googleEnabled = (JSON.parse(auth.body) as { external?: { google?: boolean } }).external?.google === true
  } catch {
    googleEnabled = false
  }
  const status = worst([
    classifyHttp(page.status, page.ms, [200]),
    classifyHttp(auth.status, auth.ms, [200]),
    googleEnabled ? 'up' : 'down',
  ])
  return result('signin', status, page.ms + auth.ms,
    `/login → ${page.status}; auth settings → ${auth.status}; google ${googleEnabled ? 'enabled' : 'DISABLED'}`)
}

async function checkSignup(origin: string): Promise<CheckResult> {
  const page = await probe(`${origin}/register`)
  const { value, ms } = await timed(() =>
    supabaseAdmin.from('site_settings').select('value').eq('key', 'registration_mode').maybeSingle(),
  )
  const settingsOk = !value.error
  const status = worst([classifyHttp(page.status, page.ms, [200]), settingsOk ? 'up' : 'down'])
  return result('signup', status, page.ms + ms,
    `/register → ${page.status}; registration_mode ${settingsOk ? `= ${value.data?.value ?? 'unset'}` : `error: ${value.error?.message}`}`)
}

async function checkDatabase(): Promise<CheckResult> {
  const { value, ms } = await timed(() => supabaseAdmin.from('site_settings').select('key').limit(1))
  if (value.error) return result('database', 'down', ms, value.error.message)
  return result('database', ms > 1000 ? 'degraded' : 'up', ms, `select → ok in ${ms}ms`)
}

async function checkStorage(): Promise<CheckResult> {
  const { value, ms } = await timed(() => supabaseAdmin.storage.listBuckets())
  if (value.error) return result('storage', 'down', ms, value.error.message)
  return result('storage', ms > SLOW_MS ? 'degraded' : 'up', ms, `${value.data.length} bucket(s)`)
}

// Each probe lists models: proves the key is accepted without spending tokens.
const AI_PROBES: Record<string, { label: string; keyEnv: string; url: string; headers: (key: string) => Record<string, string> }> = {
  openai: {
    label: 'OpenAI', keyEnv: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/models',
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  anthropic: {
    label: 'Anthropic', keyEnv: 'ANTHROPIC_API_KEY', url: 'https://api.anthropic.com/v1/models',
    headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
  },
  gemini: {
    label: 'Gemini', keyEnv: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/models',
    headers: (key) => ({ 'x-goog-api-key': key }),
  },
}

export async function checkAi(): Promise<CheckResult> {
  // Mirrors the provider selection in @drop-note/shared ai-provider.ts.
  const provider = process.env.AI_PROVIDER ?? 'openai'
  const target = AI_PROBES[provider]
  if (!target) return result('ai', 'down', 0, `unknown AI_PROVIDER "${provider}"`)
  const key = process.env[target.keyEnv]
  if (!key) return result('ai', 'down', 0, `${target.keyEnv} missing`)
  const r = await probe(target.url, { headers: target.headers(key) })
  const status = r.status === 429 ? 'degraded' : classifyHttp(r.status, r.ms, [200])
  return result('ai', status, r.ms, `${target.label} models → ${r.status}`)
}

async function checkEmailSending(): Promise<CheckResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return result('email_sending', 'down', 0, 'RESEND_API_KEY missing')
  const r = await probe('https://api.resend.com/domains', { headers: { authorization: `Bearer ${key}` } })
  // Sending-only keys can't list domains: Resend answers 401 "restricted_api_key",
  // which still proves the key is valid and the API is up.
  const restricted = r.status === 401 && r.body.includes('restricted_api_key')
  const status = restricted ? (r.ms > SLOW_MS ? 'degraded' : 'up') : classifyHttp(r.status, r.ms, [200])
  return result('email_sending', status, r.ms, `Resend /domains → ${r.status}${restricted ? ' (sending-only key: ok)' : ''}`)
}

async function checkRedis(): Promise<CheckResult> {
  const { value, ms } = await timed(() => getRedis().ping())
  return result('rate_limit', value === 'PONG' ? (ms > 1000 ? 'degraded' : 'up') : 'down', ms, `PING → ${value}`)
}

const RUNNERS: Record<string, (origin: string) => Promise<CheckResult>> = {
  website: (o) => checkPage('website', `${o}/`),
  signin: checkSignin,
  signup: checkSignup,
  dashboard_api: async (o) => {
    const r = await probe(`${o}/api/items/search?q=health`)
    return result('dashboard_api', classifyHttp(r.status, r.ms, [401]), r.ms, `GET /api/items/search (no session) → ${r.status}`)
  },
  ingest: async (o) => {
    // GET is not a handler on /api/ingest: 405 proves the function is deployed and routing works.
    const r = await probe(`${o}/api/ingest`)
    return result('ingest', classifyHttp(r.status, r.ms, [405]), r.ms, `GET /api/ingest → ${r.status}`)
  },
  database: checkDatabase,
  storage: checkStorage,
  ai: checkAi,
  email_sending: checkEmailSending,
  rate_limit: checkRedis,
}

/** Run every check in parallel. A check that throws is reported as down. */
export async function runHealthChecks(origin: string): Promise<CheckResult[]> {
  return Promise.all(
    COMPONENTS.map(async (c) => {
      const start = Date.now()
      try {
        return await RUNNERS[c.key](origin)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return result(c.key, 'down', Date.now() - start, `check failed: ${message}`)
      }
    }),
  )
}
