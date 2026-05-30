# Security Audit — Sprint 6

| Route | Auth guard | Rate limit | Input validation | Signature verify | Status |
|---|---|---|---|---|---|
| POST /api/ingest | None (sender lookup) | Yes (Redis, by tier) | SendGrid sig header | Yes | ✅ Pass |
| POST /api/auth/register | None | Yes (5/hr per IP) | invite code format | N/A | ✅ Fixed (S610) |
| GET /api/items | Supabase session | N/A | pagination params | N/A | ✅ Pass |
| GET /api/items/search | Supabase session | N/A | q length (1–200 chars) | N/A | ✅ Fixed (S610) |
| PATCH /api/items/:id | Supabase session + RLS | N/A | body schema | N/A | ✅ Pass |
| DELETE /api/items | Supabase session + RLS | N/A | UUID array (max 100) | N/A | ✅ Fixed (S610) |
| POST /api/items/bulk-tag | Supabase session + RLS | N/A | UUID array + tag strings | N/A | ✅ Fixed (S610) |
| POST /api/checkout | Supabase session | N/A | tier: 'pro'\|'power' only | N/A | ✅ Pass |
| POST /api/billing-portal | Supabase session | N/A | N/A | N/A | ✅ Pass |
| POST /api/webhooks/stripe | None (raw body) | N/A | N/A | Yes (constructEvent) | ✅ Pass |
| POST /api/account/delete | Supabase session | N/A | N/A | N/A | ✅ Pass |
| GET /api/cron/purge-trash | CRON_SECRET Bearer | N/A | N/A | N/A | ✅ Fixed (S610) |
| GET /admin/* | is_admin server check | N/A | N/A | N/A | ✅ Pass |
| POST /api/admin/* | is_admin server check | N/A | body schema | N/A | ✅ Pass |

## Findings

### P0 — Applied
- `/api/auth/register`: No rate limit → Added 5/hr per IP rate limit (Redis INCR with 1hr TTL, IP hashed with SHA-256)
- `/api/items/search`: No q validation → Added length check (1–200 chars); empty string now returns 400
- `DELETE /api/items`: No UUID validation → Added UUID regex + 100-item cap
- `/api/items/bulk-tag`: No UUID validation → Added UUID regex + 100-item cap
- `/api/cron/purge-trash`: Missing secret returns 500 → Changed to return 200 `{ skipped: true }` to prevent Vercel cron retry storms

### Notes
- No routes found exposing stack traces in production — all catch blocks log only `err.message` server-side and return generic strings to clients
- All admin routes properly check `is_admin` server-side
- Rate limit checks in `/api/auth/register` and `/api/items/search` fail open (Redis unavailable does not block the request)

### Fail-open rate limiting — deliberate trade-off

Both `/api/auth/register` and `/api/items/search` fail open when Redis is unavailable: if the rate limit check throws (Redis down, misconfigured env var, network partition), the request proceeds normally rather than returning 503.

**Why fail-open:** Failing closed on registration would block all new users during any Redis outage — an operational decision that should require deliberate action, not happen automatically. Failing closed on search would degrade the product for all users during infrastructure hiccups unrelated to abuse. The registration abuse scenario (brute-force invite codes) is also partially mitigated by invite code entropy.

**Risk accepted:** A Redis outage window allows unlimited registration attempts and unlimited search queries. The window is bounded by the Redis outage duration.

**Monitoring:** Redis errors on both routes are logged to console (and captured by Sentry in production). An alert on elevated error rates from these routes will surface any extended Redis outage quickly.

**Option C chosen** (from review R022): keep fail-open, add structured logging. If abuse via invite-code brute-force becomes a real concern, revisit with Option B (in-memory fallback).
