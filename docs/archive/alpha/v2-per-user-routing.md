# V2 Per-User Inbound Address Routing

## Current State (v1)

drop-note uses a single shared inbound address: `drop@dropnote.com`.

When a user emails this address, the SendGrid Inbound Parse webhook fires a POST to `/api/ingest`. The route handler identifies the sender by extracting the `from` header from the SendGrid payload and looking up the matching user:

```ts
const senderEmail = payload.from  // e.g. "alice@example.com"
const { data: user } = await supabase
  .from('users')
  .select('id, tier')
  .eq('email', senderEmail)
  .single()
```

**Limitation:** This model trusts the `From` header entirely. A bad actor who knows a victim's registered email address can spoof the `From` header and inject items into their account. Email `From` headers are trivially forgeable — no DKIM/SPF check is performed in the ingest route itself.

---

## Target State (v2)

Each user gets a unique inbound address: `drop+[token]@dropnote.com`, where `[token]` is the UUID stored in `users.drop_token`.

Example: `drop+a1b2c3d4-e5f6-7890-abcd-ef1234567890@dropnote.com`

The token is generated server-side on user creation (Postgres trigger `on_auth_user_created`) and never changes unless the user explicitly rotates it. It is unguessable (UUID v4). The ingest route looks up the user by token, not by sender email — the sender address becomes informational only.

Users find their personal address in Settings. They can rotate the token to revoke access from any email client or forwarding rule that previously had it.

---

## SendGrid Configuration

### v1 (current)
A single Inbound Parse route:
- Host: `dropnote.com`
- Destination: `https://dropnote.com/api/ingest`

### v2 (required change)
Replace (or supplement) the single route with a **catch-all wildcard**:
- Host: `dropnote.com`
- Subdomain match: *(empty — catch all)*
- Destination: `https://dropnote.com/api/ingest`

In the SendGrid dashboard this is configured under **Settings → Inbound Parse → Add Host & URL**. Set the hostname to `dropnote.com` with no subdomain prefix and check "Use Default Mail Settings". The wildcard means any address `*@dropnote.com` — including `drop+[token]@dropnote.com` — will be routed to the webhook.

MX records must already point to `mx.sendgrid.net` for the `dropnote.com` domain.

---

## Code Change

The only application file that needs updating is `apps/web/app/api/ingest/route.ts`.

### Pseudocode

```ts
// 1. Parse the SendGrid payload as before
const toAddress = payload.to      // e.g. "drop+a1b2c3d4@dropnote.com"
const senderEmail = payload.from  // e.g. "alice@example.com"

// 2. Try to extract a drop_token from the TO address
const tokenMatch = toAddress.match(/drop\+([^@]+)@/)
const token = tokenMatch?.[1] ?? null

// 3. Resolve the user
let user: { id: string; tier: string } | null = null

if (token) {
  // v2 path: token-based lookup — secure, unguessable
  const { data } = await supabase
    .from('users')
    .select('id, tier')
    .eq('drop_token', token)
    .single()
  user = data
} else {
  // v1 fallback: FROM email lookup — backwards compat during transition
  const { data } = await supabase
    .from('users')
    .select('id, tier')
    .eq('email', senderEmail)
    .single()
  user = data
}

if (!user) {
  return new Response('Unknown recipient', { status: 404 })
}

// ... rest of ingest logic unchanged
```

No database schema changes are needed. `users.drop_token` (UUID, NOT NULL, UNIQUE) already exists — it was added in Sprint 1.

---

## Migration Strategies

### A) Hard Cutover

On a chosen date, flip the ingest logic to **token-only**. Send all users an email (via Resend) announcing the new address format and directing them to Settings to find their personal address. Remove the FROM email fallback path.

**Pros:** Simple code, eliminates the spoofing vector immediately.
**Cons:** Users who haven't updated their email client / forwarding rule will start getting 404 errors with no items saved. High support burden for the announcement window.

### B) Dual-Mode with 30-Day Deprecation (recommended)

Ship the dual-mode code (token path + FROM email fallback) and run both for 30 days. During that window:
- Log a warning when the fallback path is used: `console.warn('[ingest] v1 fallback used for user', user.id)`
- Optionally: surface an in-dashboard banner "Your drop address has changed — update your email client by [date]"
- After 30 days: remove the fallback path and deploy again.

**Pros:** Zero user disruption during the window. Gradual migration. Telemetry via logs.
**Cons:** Two code paths to maintain briefly. The spoofing vulnerability persists during the 30-day window for users who haven't migrated.

### C) Opt-In

Add a per-user setting `routing_mode: 'email' | 'token'` (default `email`). Users who want the token address flip the setting in Settings. The ingest route checks the mode before deciding which lookup to perform.

**Pros:** No forced migration, power users can opt in early.
**Cons:** Permanent schema addition. Two permanently maintained code paths. Most users will never switch, so the security improvement is opt-in and therefore incomplete.

---

## Estimated Effort

Less than one day of engineering work.

Files to change:
- `apps/web/app/api/ingest/route.ts` — add token extraction + dual-mode lookup (20–30 lines)
- SendGrid dashboard — update Inbound Parse to catch-all wildcard (5 minutes, no code)
- `apps/web/app/(dashboard)/settings/page.tsx` (optional) — surface the personal drop address so users can copy it

No migration SQL is needed. No type regeneration needed. No schema changes.

The migration stub at `supabase/migrations/20260326130000_v2_per_user_routing_stub.sql` documents this intent and marks the migration point in the migration history.
