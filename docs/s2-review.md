# S2 Code Review — Post-Sprint Audit

**Reviewer:** Tech Lead / Code Auditor
**Date:** 2026-03-26
**Scope:** All files added or modified in Sprint 2 commits (`[s2]`), plus carryover from S1 review
**Verdict:** The core pipeline architecture is sound — shared types, clean separation between ingest route and worker, solid test coverage on pure functions. But there are critical runtime bugs that will prevent attachments from ever being processed in production, a broken PDF library call, connection management issues in the serverless ingest route, and a database tag upsert that will fail on case-insensitive conflicts. These must be fixed before the first real user sends an email with an attachment.

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| **P0 — Critical** | Will cause data loss, silent failures, or runtime crashes in production. Fix immediately. |
| **P1 — High** | Incorrect behavior or significant performance issue. Fix before launch. |
| **P2 — Medium** | Best-practice violation or latent bug. Fix this sprint or next. |
| **P3 — Low** | Cleanup / DX improvement. Schedule when convenient. |

---

## S2-R001 · P0 · Ingest route reads attachments as `string` — real SendGrid attachments are `File` objects

**What's wrong:**
In `/api/ingest/route.ts` lines 66-70:
```ts
for (const [k, value] of formData.entries()) {
  if (/^attachment\d+$/.test(k) && typeof value === 'string') {
    attachmentKeys.push(k)
    attachmentData[k] = value
  }
}
```

SendGrid Inbound Parse (with "POST the raw, full MIME message" **unchecked**, as configured in S201) delivers attachments as **binary file uploads** in the multipart POST. The Web API `FormData.entries()` yields `[string, FormDataEntryValue]` where `FormDataEntryValue` is `string | File`. Binary file uploads arrive as `File` (or `Blob`) instances — `typeof value === 'string'` is `false` for all real attachments.

**Impact:** Every attachment from every inbound email is silently discarded. The body is processed, but attachments never make it into the job payload. The `attachmentKeys` array is always empty, `attachmentData` is always `{}`. Users' image and PDF attachments are permanently lost.

The architecture doc states "SendGrid sends attachments as base64-encoded fields" — this is incorrect per SendGrid's actual Inbound Parse documentation.

**File:** `apps/web/app/api/ingest/route.ts`

**Actionable steps:**
1. Change the attachment extraction to handle `File` objects:
   ```ts
   for (const [k, value] of formData.entries()) {
     if (/^attachment\d+$/.test(k) && value instanceof File) {
       const buffer = Buffer.from(await value.arrayBuffer())
       attachmentKeys.push(k)
       attachmentData[k] = buffer.toString('base64')
     }
   }
   ```
2. Update `docs/architecture/email-pipeline.md` to correct the statement about base64 fields — it should say "binary file uploads in multipart POST."
3. Write an integration test that sends a multipart POST with a real `File` object and asserts it appears in the job payload.

**Acceptance:**
- Sending a multipart POST with a file attachment field results in a non-empty `attachmentData` in the BullMQ job payload.
- `attachmentData[key]` is a valid base64 string that can be decoded back to the original file content.

---

## S2-R002 · P0 · New IORedis TCP connection created and destroyed on every ingest request

**What's wrong:**
In `/api/ingest/route.ts` lines 133-161, every single inbound email triggers:
1. `new IORedis(process.env.REDIS_URL!, ...)` — TCP + TLS handshake to Upstash
2. `new Queue(QUEUE_NAME, { connection })` — BullMQ internal setup
3. `queue.add(...)` — enqueue the job
4. `queue.close()` + `connection.disconnect()` — tear it all down

This is called on every inbound email. Each request incurs ~100-200ms of connection overhead. Under load (e.g., 20 emails arriving in a burst from a power user), this will:
- Exhaust Upstash connection limits (free tier: 20 concurrent connections)
- Add 100-200ms latency per email just for the Redis handshake
- Risk connection leaks if the function is cold-started and killed before `disconnect()`

**File:** `apps/web/app/api/ingest/route.ts`

**Actionable steps:**
1. Hoist the IORedis connection and BullMQ Queue to module scope so they're reused across invocations in the same Vercel instance:
   ```ts
   const connection = new IORedis(process.env.REDIS_URL!, {
     maxRetriesPerRequest: null,
     enableOfflineQueue: false,
     lazyConnect: true,
   })
   const queue = new Queue(QUEUE_NAME, { connection })
   ```
2. Remove the per-request `queue.close()` and `connection.disconnect()` calls.
3. **Alternative** (if worried about stale connections in serverless): Use the `@upstash/redis` REST client to enqueue a message, and have the worker poll a Redis list instead of BullMQ. This avoids TCP connections entirely in the serverless function.

**Acceptance:**
- Module-level connection instance is reused across requests.
- Under a burst of 10 rapid requests, Upstash connection count stays at 1-2, not 10.

---

## S2-R003 · P0 · `pdf.ts` uses non-existent `pdf-parse` API — will crash at runtime

**What's wrong:**
In `apps/worker/src/lib/pdf.ts`:
```ts
import { PDFParse } from 'pdf-parse'

const parser = new PDFParse({ data: buffer })
const result = await parser.getText()
```

The `pdf-parse` npm package (any published version) does **not** export a named `PDFParse` class. The library exports a single default function. The correct usage is:
```ts
import pdfParse from 'pdf-parse'
const result = await pdfParse(buffer)
const text = result.text
```

Additionally, `package.json` specifies `"pdf-parse": "^2.4.5"` but the latest published version on npm is `1.1.1`. There is no v2. The lock file likely resolved to `1.1.1`, making the types (`@types/pdf-parse@^1.1.5`) match, but the code is still wrong.

**Impact:** Any email with a PDF attachment will throw `PDFParse is not a constructor` → the attachment item will be marked `failed` → the BullMQ job will retry 3 times, fail 3 times, and move to the dead-letter queue.

**File:** `apps/worker/src/lib/pdf.ts`

**Actionable steps:**
1. Fix the import and usage:
   ```ts
   import pdfParse from 'pdf-parse'

   export async function extractPdfText(base64Data: string): Promise<PdfExtractResult> {
     try {
       const buffer = Buffer.from(base64Data, 'base64')
       const result = await pdfParse(buffer)
       const text = result.text.slice(0, 50_000)
       return { text, error: null }
     } catch (err) {
       return { text: '', error: err instanceof Error ? err.message : 'Unknown error' }
     }
   }
   ```
2. Pin the dependency version to `^1.1.1` (actual published version).
3. Add a unit test with a real tiny PDF buffer to verify the function works.

**Acceptance:**
- `extractPdfText` with a valid base64-encoded PDF returns non-empty text.
- No `PDFParse is not a constructor` error in worker logs.

---

## S2-R004 · P1 · `upsertTags` — `onConflict` column mismatch with functional unique index

**What's wrong:**
In `apps/worker/src/lib/db.ts` line 61:
```ts
.upsert({ user_id: userId, name }, { onConflict: 'user_id,name' })
```

The unique index on `tags` is a **functional index**: `tags_user_id_name_lower_idx ON public.tags(user_id, lower(name))`. The upsert specifies `onConflict: 'user_id,name'` — but there is no unique constraint on `(user_id, name)`, only on `(user_id, lower(name))`.

**Impact:** When tag "Python" already exists and we try to upsert "python":
1. PostgREST sees no conflict on `(user_id, name)` (different casing → no match)
2. Attempts an INSERT
3. Postgres rejects it: unique violation on `tags_user_id_name_lower_idx`
4. The upsert throws an error instead of gracefully merging

Every case-insensitive duplicate tag will crash the tag persistence step. Since the AI frequently returns tags in varying cases across emails, this will happen regularly.

**File:** `apps/worker/src/lib/db.ts`

**Actionable steps:**
1. Normalize the tag name to lowercase **before** the upsert (which `normalizeTags` already does — verify it's called before this point).
2. Since both the input and the existing row will be lowercase, the conflict on `(user_id, name)` will now match. But there's still no actual UNIQUE constraint on `(user_id, name)` — only the functional index.
3. **Correct fix:** Add a plain UNIQUE constraint `UNIQUE(user_id, name)` on the `tags` table (in addition to or instead of the functional index), OR switch to a raw SQL query using `ON CONFLICT ON CONSTRAINT tags_user_id_name_lower_idx`.
4. Alternatively, do a SELECT-then-INSERT/UPDATE pattern:
   ```ts
   const { data: existing } = await supabaseAdmin
     .from('tags')
     .select('id')
     .eq('user_id', userId)
     .ilike('name', name)
     .maybeSingle()
   
   if (existing) {
     tagId = existing.id
   } else {
     const { data } = await supabaseAdmin
       .from('tags')
       .insert({ user_id: userId, name })
       .select('id')
       .single()
     tagId = data.id
   }
   ```

**Acceptance:**
- Upserting tag "Python" when "python" already exists does not throw.
- The tags table never has two rows for the same user with the same name differing only in case.

---

## S2-R005 · P1 · `upsertTags` performs N+1 sequential queries with no transaction

**What's wrong:**
The S209 ticket explicitly states: *"Wrap all tag writes in a single transaction."* The implementation doesn't do this. Each tag requires 2 sequential queries (upsert tag + upsert item_tag), and the loop runs serially:

```ts
for (const name of normalized) {          // 7 tags =
  await supabaseAdmin.from('tags').upsert(...)      // 7 queries
  await supabaseAdmin.from('item_tags').upsert(...)  // + 7 queries = 14 round-trips
}
```

**Impact:**
1. **Latency:** 14 sequential HTTP requests to Supabase for 7 tags. At ~50ms each, that's ~700ms just for tags, per item. For an email with 3 attachments, each generating 5 tags, that's ~4200ms of tag writing alone.
2. **No atomicity:** If the process crashes mid-loop, some tags are linked, others aren't. The item shows up with partial tags.
3. **Silent skips:** Line 65: `if (tagError || !tag) continue` — tag failures are silently ignored. The user never knows tags were lost.

**File:** `apps/worker/src/lib/db.ts`

**Actionable steps:**
1. Use Supabase's RPC or a raw SQL function to batch all tag upserts in one call.
2. At minimum, use `Promise.all` with batched inserts rather than sequential awaits:
   ```ts
   const tagIds = await Promise.all(
     normalized.map(async (name) => {
       const { data } = await supabaseAdmin
         .from('tags')
         .upsert({ user_id: userId, name })
         .select('id')
         .single()
       return data?.id
     })
   )
   const validPairs = tagIds
     .filter(Boolean)
     .map((tagId) => ({ item_id: itemId, tag_id: tagId! }))
   
   if (validPairs.length > 0) {
     await supabaseAdmin
       .from('item_tags')
       .upsert(validPairs, { onConflict: 'item_id,tag_id' })
   }
   ```
3. Log a warning when tag upsert fails instead of silently continuing.

**Acceptance:**
- Tag persistence for 7 tags completes in ≤3 database round-trips, not 14.
- A failure in one tag upsert doesn't silently swallow the error.

---

## S2-R006 · P1 · Welcome email "first sign-in" detection uses fragile 30-second window

**What's wrong:**
In `auth/callback/route.ts` line 23:
```ts
if (profile && Date.now() - new Date(profile.created_at).getTime() < 30_000)
```

This checks if the user's `created_at` was within the last 30 seconds to determine "first sign-in." Problems:
1. **Slow email delivery:** If the magic link email takes >30 seconds to arrive and be clicked, the window is missed. No welcome email is ever sent.
2. **Duplicate sends:** If the user signs out and back in within 30 seconds of account creation, they get a duplicate welcome email.
3. **Clock skew:** Server time and database `now()` could differ if Supabase and Vercel are in different regions.

**File:** `apps/web/app/auth/callback/route.ts`

**Actionable steps:**
1. Add a `welcome_email_sent boolean NOT NULL DEFAULT false` column to `public.users`.
2. In the callback, check `profile.welcome_email_sent === false`.
3. After sending, update `SET welcome_email_sent = true` (fire-and-forget is fine for the update).
4. Alternatively, check if this is the user's first session by querying Supabase Auth's session count or using a `last_sign_in_at` column.

**Acceptance:**
- A new user clicking the magic link 5 minutes after account creation still receives the welcome email.
- Signing in a second time never sends a duplicate welcome email.
- `welcome_email_sent` column exists on `public.users` with a migration.

---

## S2-R007 · P1 · `processEmail` continues processing attachments after body fails

**What's wrong:**
In `apps/worker/src/processors/email.ts` lines 34-45:
```ts
if (bodyResult.error && !bodyResult.summary) {
  await setItemFailed(bodyItemId, bodyResult.error)
} else {
  await setItemDone(bodyItemId, { aiSummary: bodyResult.summary, ... })
  if (bodyResult.tags.length > 0) {
    await upsertTags(userId, bodyItemId, bodyResult.tags)
  }
}

// Continues to process attachments regardless of body failure...
for (const attachment of parsed.attachments) { ... }
```

Two issues:
1. **Partial error swallowed:** If `bodyResult.error` is truthy AND `bodyResult.summary` is also truthy (e.g., "summary from cache but API returned an error"), the error is silently discarded. The item is marked `done` with no indication anything went wrong.
2. **Questionable flow:** After the body item is marked `failed`, the code still processes all attachments. While attachments are separate items, it's unclear if this is intentional behavior. If the AI is down (causing body failure), attachment AI calls will also fail, wasting API calls and creating many `failed` items.

**File:** `apps/worker/src/processors/email.ts`

**Actionable steps:**
1. Log the error even when a partial summary exists:
   ```ts
   if (bodyResult.error) {
     console.warn(`[processor] AI error for ${bodyItemId}: ${bodyResult.error}`)
   }
   ```
2. If the body fails due to an AI service error (not a parsing error), skip AI calls for attachments too — they'll fail for the same reason. Mark them as `failed` with "AI service unavailable, will retry."
3. Rethrow on service-level AI errors so BullMQ retries the entire job when the service recovers.

**Acceptance:**
- When the OpenAI API is down, the job is retried (not marked done with empty summary).
- A partial error (summary exists but error also exists) is logged.

---

## S2-R008 · P2 · Supabase admin client created per request in ingest route

**What's wrong:**
`/api/ingest/route.ts` line 78 calls `getAdminClient()` which creates a new `createClient<Database>(...)` per request. Unlike the worker's `supabase.ts` which exports a singleton, the ingest route re-creates the client every time.

The Supabase JS client is REST-based so this isn't catastrophic, but it allocates unnecessary objects and re-initializes internal state on every invocation.

**File:** `apps/web/app/api/ingest/route.ts`

**Actionable steps:**
1. Hoist to module scope:
   ```ts
   const supabaseAdmin = createClient<Database>(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.SUPABASE_SERVICE_ROLE_KEY!,
     { auth: { persistSession: false } }
   )
   ```
2. Use directly in the POST handler.

**Acceptance:**
- Single Supabase client instance at module scope, reused across requests.

---

## S2-R009 · P2 · No request body size configuration — Vercel default is 4.5MB

**What's wrong:**
Next.js API routes have a default body size limit of 4.5MB on Vercel. SendGrid Inbound Parse payloads can reach 20MB+ with attachments. The ingest route has a Content-Length guard at 20MB (line 51), but Vercel will reject the request with a 413 before the code even runs.

The `next.config.mjs` doesn't configure `api.bodyParser.sizeLimit`, and there's no Vercel-specific config for the function size limit.

**File:** `apps/web/app/api/ingest/route.ts`, `apps/web/next.config.mjs`

**Actionable steps:**
1. For App Router routes, Next.js doesn't use the `bodyParser` config. Instead, the incoming `Request` body is streamed. In practice, Vercel's serverless function payload limit is 4.5MB by default.
2. Investigate setting `maxDuration` and using Vercel's `streaming` or switching the ingest function to a Vercel Edge Function (which has different limits).
3. Document the maximum attachment size that can actually be received, and align tier limits with what Vercel supports.
4. Consider a two-phase approach: ingest route receives the webhook, uploads large attachments directly to Supabase Storage, and passes only metadata to the queue.

**Acceptance:**
- A 10MB email (free tier max) can be received and processed without Vercel rejecting it.
- Document the actual body size limits in the architecture doc.

---

## S2-R010 · P2 · `invite_codes` UPDATE policy allows modifying any column on unclaimed codes

**What's wrong:**
In `20240001000002_hardening.sql`:
```sql
CREATE POLICY "invite_codes: claim unclaimed"
  ON public.invite_codes FOR UPDATE
  USING (used_by IS NULL);
```

This policy has a `USING` clause but no `WITH CHECK` clause. Any authenticated user can update **any column** of any unclaimed invite code — including `code`, `created_by`, and `created_at`. A malicious user could:
- Change an invite code's value to something they know, then "claim" it.
- Change `created_by` to impersonate an admin.

**File:** `supabase/migrations/20240001000002_hardening.sql`

**Actionable steps:**
1. Add a `WITH CHECK` clause that restricts what can be changed:
   ```sql
   CREATE POLICY "invite_codes: claim unclaimed"
     ON public.invite_codes FOR UPDATE
     USING (used_by IS NULL)
     WITH CHECK (
       used_by = auth.uid()
       AND code = (SELECT code FROM public.invite_codes WHERE id = invite_codes.id)
       AND created_by = (SELECT created_by FROM public.invite_codes WHERE id = invite_codes.id)
     );
   ```
2. Or, simpler: use an RPC function for claiming codes that only allows setting `used_by` and `used_at`.

**Acceptance:**
- An authenticated user can claim an unclaimed code (set `used_by = auth.uid()`, `used_at = now()`).
- An authenticated user **cannot** change `code`, `created_by`, or `created_at` on any invite code.

---

## S2-R011 · P2 · `database.types.ts` is stale — missing `updated_at` columns

**What's wrong:**
The `20240001000002_hardening.sql` migration added `updated_at timestamptz` to both `users` and `items`. But the generated `database.types.ts` doesn't include `updated_at` in either table's `Row`, `Insert`, or `Update` types.

This means:
- TypeScript won't autocomplete `updated_at` on query results.
- Setting `updated_at` in an update would be a type error (even though the column exists).
- The types are lying about the schema.

**File:** `packages/shared/src/database.types.ts`

**Actionable steps:**
1. Re-run `pnpm gen:types` (which runs `supabase gen types typescript --linked > packages/shared/src/database.types.ts`).
2. Commit the updated file.
3. Add a CI check that verifies the types are up-to-date (diff against freshly generated output).

**Acceptance:**
- `database.types.ts` includes `updated_at: string` on `items.Row` and `users.Row`.
- CI fails if someone changes a migration without regenerating types.

---

## S2-R012 · P2 · Worker missing `dotenv/config` import — `.env` not loaded in dev mode

**What's wrong:**
The S203 ticket specifies `import 'dotenv/config'` in the worker entry point, and `dotenv` is listed as a dependency. But `apps/worker/src/index.ts` does **not** import it:
```ts
import IORedis from 'ioredis'
import { Worker } from 'bullmq'
import { QUEUE_NAME } from '@drop-note/shared'
import { processEmail } from './processors/email'
```

In Railway, environment variables are injected externally, so this works in production. But running `pnpm --filter @drop-note/worker dev` locally will fail because `process.env.REDIS_URL` is `undefined` — the `.env` file is never loaded.

**File:** `apps/worker/src/index.ts`

**Actionable steps:**
1. Add `import 'dotenv/config'` as the first import in `src/index.ts`.
2. Alternatively, use `tsx --env-file=.env watch src/index.ts` in the dev script.

**Acceptance:**
- `pnpm --filter @drop-note/worker dev` with a valid `.env` file starts without crashing on missing env vars.

---

## S2-R013 · P2 · Worker only handles SIGTERM, not SIGINT

**What's wrong:**
`apps/worker/src/index.ts` line 25:
```ts
process.on('SIGTERM', async () => {
  await worker.close()
  await connection.quit()
})
```

`SIGTERM` is sent by Docker/Railway on stop. But `SIGINT` (Ctrl+C) is sent during local development. Without handling it, pressing Ctrl+C during `pnpm dev` leaves the worker with:
- An open Redis connection
- Potentially in-progress jobs that are abandoned (not returned to the queue)
- BullMQ marks the job as "stalled" after timeout, then retries — but the delay is confusing during development.

**File:** `apps/worker/src/index.ts`

**Actionable steps:**
1. Add SIGINT handling:
   ```ts
   async function shutdown() {
     console.log('[worker] Shutting down gracefully...')
     await worker.close()
     await connection.quit()
     process.exit(0)
   }
   process.on('SIGTERM', shutdown)
   process.on('SIGINT', shutdown)
   ```

**Acceptance:**
- Ctrl+C during local development prints a shutdown message and exits cleanly.
- No stalled jobs in Redis after local shutdown.

---

## S2-R014 · P2 · Rate limit INCR + conditional EXPIRE has a race condition

**What's wrong:**
In `/api/ingest/route.ts` lines 104-108:
```ts
const count = await redis.incr(rateLimitKey)
if (count === 1) {
  await redis.expire(rateLimitKey, 3600)
}
```

If the function crashes (or Vercel kills the instance) after `INCR` but before `EXPIRE` when `count === 1`, the key persists forever without a TTL. The user would be permanently rate-limited until someone manually deletes the key.

**File:** `apps/web/app/api/ingest/route.ts`

**Actionable steps:**
1. Use a single atomic operation. Upstash Redis supports Lua scripts or pipeline:
   ```ts
   const pipeline = redis.pipeline()
   pipeline.incr(rateLimitKey)
   pipeline.expire(rateLimitKey, 3600)
   const results = await pipeline.exec()
   const count = results[0] as number
   ```
   `EXPIRE` is idempotent — calling it every time just resets the TTL, which is fine (slightly extends the window but negligibly).
2. Or use `redis.eval()` with a Lua script for true atomicity.

**Acceptance:**
- Rate limit key always has a TTL, even if the function crashes between operations.
- No rate limit keys with TTL = -1 (persistent) in Redis.

---

## S2-R015 · P2 · No environment variable validation on startup

**What's wrong:**
Both the web app's ingest route and the worker use `process.env.X!` with TypeScript non-null assertions everywhere. If any required env var is missing:
- The app crashes deep in a library call with an unhelpful error (e.g., `Invalid URL: undefined` from the Supabase client)
- No indication of **which** env var is missing
- The worker might process half a job before crashing, leaving items in an inconsistent state

**Files:** `apps/web/app/api/ingest/route.ts`, `apps/worker/src/index.ts`, `apps/worker/src/lib/supabase.ts`

**Actionable steps:**
1. Create `packages/shared/src/env.ts` with a validation helper:
   ```ts
   export function requireEnv(name: string): string {
     const value = process.env[name]
     if (!value) throw new Error(`Missing required environment variable: ${name}`)
     return value
   }
   ```
2. In the worker `src/index.ts`, validate all required vars on startup before connecting:
   ```ts
   const REDIS_URL = requireEnv('REDIS_URL')
   const SUPABASE_URL = requireEnv('SUPABASE_URL')
   const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
   const OPENAI_API_KEY = requireEnv('OPENAI_API_KEY')
   ```
3. Do the same for the web app's server-side env vars.

**Acceptance:**
- Starting the worker without `REDIS_URL` prints `Missing required environment variable: REDIS_URL` and exits immediately (no cryptic crash 30 seconds later).

---

## S2-R016 · P2 · `parseFromAddress` doesn't validate the extracted email

**What's wrong:**
`packages/shared/src/email.ts` `parseFromAddress` extracts text from angle brackets or trims whitespace, but never validates the result is a real email. A malformed `From` header like `<not-an-email>` returns `"not-an-email"`, which is then used as a database lookup key.

While this isn't exploitable (unmatched emails are silently discarded), it means garbage `From` headers still trigger a database query. Combined with a high volume of spam, this adds unnecessary DB load.

**File:** `packages/shared/src/email.ts`

**Actionable steps:**
1. After extracting the email, validate with `isValidEmail()` (already in `auth.ts`):
   ```ts
   export function parseFromAddress(raw: string): string {
     if (!raw) return ''
     const match = raw.match(/<([^>]+)>/)
     const email = match ? match[1].toLowerCase() : raw.trim().toLowerCase()
     return isValidEmail(email) ? email : ''
   }
   ```
2. Add test cases: `parseFromAddress('<not-an-email>')` → `''`.

**Acceptance:**
- `parseFromAddress('<garbage>')` returns `''`, preventing a wasted database lookup.
- Existing valid-email test cases still pass.

---

## S2-R017 · P2 · Dockerfile doesn't set `NODE_ENV=production`

**What's wrong:**
The worker `Dockerfile` runner stage doesn't set `ENV NODE_ENV=production`. This means:
- `process.env.NODE_ENV` is `undefined` in the running container
- Libraries like OpenAI SDK may include debug logging
- `ioredis` may not optimize for production
- Node.js itself behaves differently without this flag (less aggressive GC, etc.)

**File:** `apps/worker/Dockerfile`

**Actionable steps:**
1. Add to the runner stage:
   ```dockerfile
   FROM node:20-alpine AS runner
   ENV NODE_ENV=production
   WORKDIR /app
   ```

**Acceptance:**
- `docker exec <container> node -e "console.log(process.env.NODE_ENV)"` prints `production`.

---

## S2-R018 · P2 · Root `.env.example` missing all S2 environment variables

**What's wrong:**
The root `.env.example` only has:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_DROP_ADDRESS=drop@dropnote.com
```

Missing from S2:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `REDIS_URL`
- `SENDGRID_INGEST_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_ADDRESS`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_APP_URL`

A developer cloning the repo has no idea these are needed. The worker has its own `.env.example` with 4 vars, but the web app's ingest-route vars aren't documented anywhere.

**File:** `.env.example`

**Actionable steps:**
1. Update root `.env.example` with all required vars for both web and worker, grouped by service.
2. Add comments explaining which service each var is for.

**Acceptance:**
- A developer can run `cp .env.example .env` and see every variable they need to fill in, with comments explaining each.

---

## S2-R019 · P2 · `openai.ts` hardcodes model name — blocks self-hosted configurability

**What's wrong:**
`apps/worker/src/lib/openai.ts` hardcodes `model: 'gpt-4o-mini'` in both `summarizeEmailBody` and `describeImage`. Per `CLAUDE.md` and `v1-scope.md`, self-hosted users should be able to configure the AI model via `.env`. The current code forces GPT-4o-mini regardless of configuration.

**File:** `apps/worker/src/lib/openai.ts`

**Actionable steps:**
1. Read from env:
   ```ts
   const AI_MODEL = process.env.AI_MODEL ?? 'gpt-4o-mini'
   const VISION_MODEL = process.env.AI_VISION_MODEL ?? process.env.AI_MODEL ?? 'gpt-4o-mini'
   ```
2. Add `AI_MODEL` and `AI_VISION_MODEL` to the worker `.env.example`.
3. Document supported values in the architecture doc.

**Acceptance:**
- Setting `AI_MODEL=gpt-4o` in `.env` causes the worker to use `gpt-4o` for summarization.
- Default behavior (no env var) remains `gpt-4o-mini`.

---

## S2-R020 · P3 · `.dockerignore` is in wrong location for non-BuildKit builds

**What's wrong:**
`apps/worker/.dockerignore` is inside the `apps/worker/` directory. Docker build is run from the repo root (`docker build -f apps/worker/Dockerfile .`). Classic Docker only reads `.dockerignore` at the build context root. The file at `apps/worker/.dockerignore` is ignored by non-BuildKit builds, meaning `node_modules`, `.env`, and other files get sent to the build daemon.

BuildKit (enabled by default in newer Docker versions) does support `.dockerignore` next to the Dockerfile, but this is not universal across all CI environments.

**File:** `apps/worker/.dockerignore`

**Actionable steps:**
1. Create a root `.dockerignore` that covers the worker build context:
   ```
   **/node_modules
   **/.env*
   **/.next
   **/dist
   **/.turbo
   **/coverage
   ```
2. Keep `apps/worker/.dockerignore` as a fallback for BuildKit.

**Acceptance:**
- `docker build` context sent to daemon is <10MB (not hundreds of MB from `node_modules`).

---

## S2-R021 · P3 · No structured logging in worker or ingest route

**What's wrong:**
All logging is bare `console.log` / `console.error` with informal prefixes like `[worker]`, `[processor]`, `[ingest]`. In production (Railway logs, Vercel logs), these produce unstructured text that's hard to filter, query, or alert on.

**Files:** `apps/worker/src/**`, `apps/web/app/api/ingest/route.ts`

**Actionable steps:**
1. For now, create a minimal logger wrapper in `packages/shared/src/logger.ts`:
   ```ts
   export function createLogger(service: string) {
     return {
       info: (msg: string, meta?: Record<string, unknown>) =>
         console.log(JSON.stringify({ level: 'info', service, msg, ...meta, ts: Date.now() })),
       error: (msg: string, meta?: Record<string, unknown>) =>
         console.error(JSON.stringify({ level: 'error', service, msg, ...meta, ts: Date.now() })),
       warn: (msg: string, meta?: Record<string, unknown>) =>
         console.warn(JSON.stringify({ level: 'warn', service, msg, ...meta, ts: Date.now() })),
     }
   }
   ```
2. Replace `console.log` calls in worker and ingest route with the structured logger.
3. Defer a full logging library (pino, winston) until Sprint 5 when Sentry is integrated.

**Acceptance:**
- Railway logs show JSON-formatted log lines with `level`, `service`, `msg`, and `ts` fields.
- Logs are filterable by `service: "worker"` or `service: "ingest"`.

---

## S2-R022 · P3 · No Dockerfile `HEALTHCHECK`

**What's wrong:**
The worker Dockerfile has no `HEALTHCHECK` instruction. Railway (and Docker Swarm / k8s) can't distinguish between a healthy idle worker and a crashed process that's still holding the PID.

**File:** `apps/worker/Dockerfile`

**Actionable steps:**
1. Add a minimal health check. Since the worker doesn't serve HTTP, use a process check or add a tiny HTTP health endpoint in S5.
2. For now, Railway's crash detection (exit code ≠ 0) is sufficient, but document this as a Sprint 5 task.

**Acceptance:**
- Documented as Sprint 5 task; no action needed now beyond acknowledgment.

---

## Carryover from S1 Review (Not Addressed in S2)

These items from the S1 review were not fixed during Sprint 2:

| S1 Ticket | Issue | Status |
|-----------|-------|--------|
| R-013 | `block_list.type` uses CHECK instead of ENUM | Still open — inconsistent with other columns |
| R-017 | Middleware calls `getUser()` on public pages (`/login`, `/auth/callback`) | Still open — unnecessary latency on every public page load |

Both should be scheduled for Sprint 3.

---

## Summary by Priority

| Priority | Count | Tickets |
|----------|-------|---------|
| P0 — Critical | 3 | S2-R001, S2-R002, S2-R003 |
| P1 — High | 4 | S2-R004, S2-R005, S2-R006, S2-R007 |
| P2 — Medium | 10 | S2-R008 – S2-R019 |
| P3 — Low | 3 | S2-R020, S2-R021, S2-R022 |
| Carryover | 2 | R-013, R-017 |
| **Total** | **22** | |

### Recommended execution order

1. **Immediate hotfix** (before any real user sends an email with attachments): S2-R001, S2-R002, S2-R003
2. **This week** (before launch): S2-R004, S2-R005, S2-R006, S2-R007
3. **Sprint 3 alongside feature work**: S2-R008 through S2-R019 + carryover R-013, R-017
4. **Backlog**: S2-R020, S2-R021, S2-R022
