# Sprint 2 — Engineering Tickets

> Sprint goal: Full email-to-item pipeline working end-to-end.
> Deliverable: Forward a real email to `drop@dropnote.com` → item appears in DB with AI summary and tags within 30 seconds.
> Total: 29 points across 12 tickets.

---

### S201 — SendGrid Inbound Parse setup
**Type:** setup
**Points:** 2
**Depends on:** S110

**Goal:** Route inbound email for `drop@dropnote.com` to the `/api/ingest` endpoint so SendGrid delivers structured POST payloads to the application rather than requiring any raw SMTP handling.

**Scope:**
- Log in to the SendGrid dashboard and navigate to Settings → Inbound Parse
- Add MX record on the DNS provider for `dropnote.com`:
  - Record type: `MX`
  - Host: `@` (or the subdomain receiving inbound mail, e.g. `mail`)
  - Value: `mx.sendgrid.net`
  - Priority: `10`
  - TTL: `300` (or lowest available)
- In SendGrid → Settings → Sender Authentication, complete Domain Authentication for `dropnote.com`:
  - Add the three CNAME records SendGrid generates (em, s1, s2 DKIM selectors) to the DNS provider
  - Verify all DNS records pass the SendGrid validation check (green checkmarks)
- In SendGrid → Settings → Inbound Parse → Add Host & URL:
  - Hostname: `dropnote.com` (or the verified subdomain)
  - URL: `https://<production-vercel-url>/api/ingest?key=<SENDGRID_INGEST_SECRET>`
  - "POST the raw, full MIME message": **leave unchecked** — use SendGrid's parsed fields (structured POST), not raw MIME
- Generate a random 32-character hex string for `SENDGRID_INGEST_SECRET`. Add it to:
  - Vercel environment variables (Production + Preview)
  - `apps/web/.env.local`
  - `.env.example` at repo root (placeholder value)
- Use SendGrid's "Send Test" feature (Inbound Parse → Send a Test) to confirm a POST reaches Vercel function logs
- Document all DNS records added in `docs/dns-records.md` (host, type, value, TTL)

**Acceptance criteria:**
1. `dig MX dropnote.com` returns `mx.sendgrid.net` with priority 10.
2. The SendGrid Sender Authentication page shows all CNAME records green for `dropnote.com`.
3. The SendGrid Inbound Parse settings shows one entry: hostname `dropnote.com`, URL containing `/api/ingest`.
4. Sending a test email (or using SendGrid's "Send Test") causes a POST to appear in Vercel function logs for `/api/ingest`.
5. `SENDGRID_INGEST_SECRET` is present in `.env.example` and in Vercel's environment variables tab.
6. `docs/dns-records.md` exists and lists all DNS records added.

**Out of scope:**
- SendGrid domain authentication for outbound mail (that is Resend — S210)
- SPF/DKIM spoofing validation on inbound (v2)
- Per-user token addresses (`drop+[token]@dropnote.com`) — v2

---

### S202 — `/api/ingest` Next.js route handler
**Type:** feat
**Points:** 3
**Depends on:** S201, S203

**Goal:** Be the single entry point for all inbound email webhooks — authenticate the SendGrid request, look up the user, enforce rate limits, and enqueue a processing job — while always returning HTTP 200 so SendGrid never retries a delivery.

**Scope:**
- Create `apps/web/app/api/ingest/route.ts` exporting a `POST` handler
- **Shared-secret authentication:**
  - Read `key` from URL query string: `request.nextUrl.searchParams.get('key')`
  - Compare with `process.env.SENDGRID_INGEST_SECRET` using `crypto.timingSafeEqual`
  - If missing or mismatched: return `NextResponse.json({ ok: false }, { status: 200 })` — always 200 to SendGrid
- **Parse multipart form data:**
  - Call `request.formData()` to parse SendGrid's multipart POST
  - Extract fields: `from`, `subject`, `text`, `html`, `attachment-info`, and numbered attachment fields (`attachment1`, `attachment2`, …)
  - Guard: if `Content-Length` header > 20MB, discard and return 200
- **User lookup:**
  - Use Supabase admin client (service role key — bypasses RLS)
  - Extract bare email from `from` field using `parseFromAddress` from `@drop-note/shared` (S204)
  - Query `SELECT id, tier FROM public.users WHERE email = $1 LIMIT 1`
  - If no match: return 200 silently (do not log unknown sender email in plain text)
- **Block list check:**
  - Query `SELECT 1 FROM public.block_list WHERE type = 'email' AND value = $1 LIMIT 1`
  - If blocked: return 200 silently
- **Rate limit (Redis):**
  - Install `@upstash/redis`: `pnpm add @upstash/redis --filter @drop-note/web`
  - Env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - Key: `ratelimit:email:{user_id}` — `INCR` then `EXPIRE 3600` if new key (result === 1)
  - Use `isOverRateLimit(count, tier)` from `@drop-note/shared` (S212)
  - If over limit: return 200 silently (no rejection email in Sprint 2 — Sprint 3)
- **Create pending item:**
  - Call `createPendingItem` (from `apps/web/lib/db.ts`) to insert `status: 'pending'` body item
  - This makes the item immediately visible in the DB before the worker picks it up
- **Enqueue BullMQ job:**
  - Install `bullmq`: `pnpm add bullmq --filter @drop-note/web`
  - Import `QUEUE_NAME`, `EmailJobPayload` from `@drop-note/shared`
  - Create `Queue` instance connected to Upstash Redis
  - Payload includes: `userId`, `userTier`, `from`, `subject`, `text`, `html`, `attachmentInfo`, `attachmentKeys`, `attachmentData`, `bodyItemId`, `receivedAt`
  - `queue.add('process-email', payload, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } })`
- **Response:** always return `NextResponse.json({ ok: true }, { status: 200 })`
- Add to `.env.example`: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENDGRID_INGEST_SECRET`

**Acceptance criteria:**
1. `curl -X POST ".../api/ingest"` (no `?key`) returns HTTP 200 `{"ok":false}`.
2. `curl -X POST ".../api/ingest?key=<secret>"` with `from` of an unknown user returns HTTP 200 `{"ok":true}` and no job enqueued.
3. A real test email from a registered user causes a job to appear in the queue — verifiable via Upstash dashboard: `email-pipeline` queue has ≥ 1 waiting job.
4. After 6 requests from a free-tier user within an hour, the 6th produces no new job (rate limit enforced). Redis key `ratelimit:email:{user_id}` equals `6`.
5. A request from a blocked sender returns 200 with no job enqueued.
6. `pnpm --filter @drop-note/web typecheck` exits 0.

**Out of scope:**
- Item cap enforcement (Sprint 3)
- Monthly save action counting (Sprint 3)
- Rejection notification emails (Sprint 3)
- IP-based rate limiting (Sprint 5)
- Auto-block after spam attempts (Sprint 5)

---

### S203 — `apps/worker` scaffold with BullMQ and Redis
**Type:** setup
**Points:** 2
**Depends on:** S101

**Goal:** Stand up the worker process as a proper Node.js service that connects to Redis and processes jobs from the queue, and define the shared queue type contract so both the web app and worker agree on job shape.

**Scope:**
- **`packages/shared/src/queue.ts`** — create with exports:
  ```ts
  export const QUEUE_NAME = 'email-pipeline'

  export interface EmailJobPayload {
    userId: string
    userTier: 'free' | 'pro' | 'power'
    from: string
    subject: string
    text: string
    html: string
    attachmentInfo: string   // raw JSON string from SendGrid "attachment-info" field
    attachmentKeys: string[] // ["attachment1", "attachment2", ...]
    attachmentData: Record<string, string> // key → base64 string
    bodyItemId: string       // pre-created pending item ID
    receivedAt: string       // ISO 8601
  }

  export interface EmailJobResult {
    itemIds: string[]
    status: 'done' | 'failed'
  }
  ```
  Re-export from `packages/shared/src/index.ts`

- **`apps/worker/package.json`** — replace stub:
  - `"name": "@drop-note/worker"`, `"version": "0.0.1"`
  - Scripts: `"dev": "tsx watch src/index.ts"`, `"build": "tsc"`, `"start": "node dist/index.js"`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`
  - Dependencies: `bullmq`, `ioredis`, `@upstash/redis`, `@drop-note/shared: "workspace:*"`, `dotenv`
  - DevDependencies: `tsx`, `typescript`, `@types/node`, `vitest`

- **`apps/worker/tsconfig.json`**:
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "lib": ["ES2022"],
      "outDir": "dist",
      "rootDir": "src",
      "module": "commonjs"
    },
    "include": ["src"]
  }
  ```

- **`apps/worker/src/index.ts`** — entry point:
  - `import 'dotenv/config'`
  - Create `ioredis` connection from `REDIS_URL` env var
  - Instantiate `new Worker(QUEUE_NAME, processEmail, { connection })`
  - Log `Worker started, listening on queue: ${QUEUE_NAME}` on boot
  - Handle `worker.on('failed', ...)` and `worker.on('completed', ...)` — log job ID and outcome

- **`apps/worker/src/processors/email.ts`** — skeleton:
  - Export `async function processEmail(job: Job<EmailJobPayload>): Promise<EmailJobResult>`
  - Log `Processing job ${job.id} for user ${job.data.userId}` and return `{ itemIds: [], status: 'done' }`
  - This will be fleshed out in S204–S209

- **`apps/worker/.env.example`**:
  ```
  REDIS_URL=redis://localhost:6379
  SUPABASE_URL=
  SUPABASE_SERVICE_ROLE_KEY=
  OPENAI_API_KEY=
  ```

- Add `REDIS_URL` to root `.env.example`

**Acceptance criteria:**
1. `pnpm --filter @drop-note/worker dev` starts without errors and prints `Worker started, listening on queue: email-pipeline`.
2. `pnpm --filter @drop-note/worker typecheck` exits 0.
3. With a local Redis running (`docker run -p 6379:6379 redis:alpine`), manually enqueuing a job causes the worker to log a processing attempt.
4. `cat packages/shared/src/queue.ts` exports `QUEUE_NAME`, `EmailJobPayload`, `EmailJobResult`.
5. `pnpm turbo typecheck` exits 0 across all packages including `apps/worker`.

**Out of scope:**
- Real processing logic (S204–S209)
- Dockerfile (S211)
- Railway deployment (S211)

---

### S204 — Email parsing: extract subject, body, and attachments from SendGrid fields
**Type:** feat
**Points:** 2
**Depends on:** S203

**Goal:** Produce clean, tested pure functions that transform a raw SendGrid form-data payload into strongly typed structures the processor can hand to storage and AI steps — keeping all parsing isolated from I/O so it is trivially testable.

**Scope:**
- Create `packages/shared/src/email.ts` with the following exports:

  **`parseFromAddress(raw: string): string`**
  - Accepts `"Display Name <email@example.com>"` or `"email@example.com"`
  - Returns bare email in lowercase. Regex: match `<([^>]+)>`, else trim whole string.

  **`parseSendGridPayload(fields: Record<string, string>): ParsedEmail`**
  ```ts
  export interface ParsedEmail {
    from: string
    subject: string          // defaults to "(no subject)" if empty
    bodyText: string         // truncated to 50,000 chars
    bodyHtml: string
    attachments: ParsedAttachment[]
  }

  export interface ParsedAttachment {
    filename: string
    mimeType: string
    data: string             // base64
    size: number             // decoded byte size
  }
  ```
  - Parse `attachment-info` JSON field; match each entry to numbered field keys
  - **Silently filter unsupported MIME types** — keep only: `text/*`, `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`
  - Truncate `bodyText` to 50,000 characters

  **`countItems(parsed: ParsedEmail): number`**
  - Returns `1 + parsed.attachments.length`

  **`enforceAttachmentSizeLimit(attachment: ParsedAttachment, tier: 'free' | 'pro' | 'power'): boolean`**
  - Limits: `free` 10MB, `pro` 25MB, `power` 50MB
  - Returns `true` if within limit

- Re-export all from `packages/shared/src/index.ts`
- No external dependencies

**Acceptance criteria:**
1. `parseFromAddress('"Alice Smith <alice@example.com>"')` → `"alice@example.com"`.
2. `parseFromAddress('bob@example.com')` → `"bob@example.com"`.
3. `parseSendGridPayload` with a `.zip` attachment → `attachments.length === 0`.
4. `parseSendGridPayload` with 60,000 char body → `bodyText.length === 50000`.
5. `countItems` with 2 attachments → `3`.
6. `enforceAttachmentSizeLimit` for 15MB on `free` → `false`.
7. `pnpm --filter @drop-note/shared typecheck` exits 0.
8. All S212 unit tests for these functions pass.

**Out of scope:**
- Raw MIME parsing (SendGrid pre-parses)
- HTML-to-text conversion (use `bodyText` for AI; HTML stored as-is)
- Link extraction (v2)

---

### S205 — File upload to Supabase Storage with tier size enforcement
**Type:** feat
**Points:** 3
**Depends on:** S204

**Goal:** Persist each attachment to Supabase Storage under a per-user, per-item path and enforce tier-specific file size limits — so the worker never stores oversized files and every attachment is later retrievable by signed URL.

**Scope:**
- Create storage bucket via migration `supabase/migrations/20240002000000_storage_bucket.sql`:
  ```sql
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('attachments', 'attachments', false)
  ON CONFLICT (id) DO NOTHING;
  ```
  Apply with `supabase db push --linked`

- Create `apps/worker/src/lib/supabase.ts`:
  - Export singleton `supabaseAdmin` using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  - `createClient(..., { auth: { persistSession: false } })`

- Create `apps/worker/src/lib/storage.ts`:
  ```ts
  interface UploadParams {
    userId: string
    itemId: string
    filename: string
    mimeType: string
    data: string       // base64
    tier: 'free' | 'pro' | 'power'
  }
  interface UploadResult {
    storagePath: string | null
    error: string | null
  }
  ```
  - Storage path: `attachments/{userId}/{itemId}/{sanitized_filename}` (replace spaces with underscores, strip path separators)
  - Check `enforceAttachmentSizeLimit` first; if fails return `{ storagePath: null, error: 'File exceeds size limit...' }`
  - Decode base64: `Buffer.from(data, 'base64')`
  - Upload: `supabaseAdmin.storage.from('attachments').upload(path, buffer, { contentType: mimeType, upsert: false })`
  - Return `{ storagePath: path, error: null }` on success, `{ storagePath: null, error: message }` on failure

- Add `@supabase/supabase-js` to `apps/worker`: `pnpm add @supabase/supabase-js --filter @drop-note/worker`

**Acceptance criteria:**
1. Uploading a 1KB PNG for a free-tier user creates a file at `attachments/{userId}/{itemId}/test.png` — visible in Supabase Storage browser.
2. Uploading a 15MB file for a free-tier user returns `{ storagePath: null, error: '...' }` — no file in bucket.
3. Uploading a 20MB file for a pro-tier user succeeds; a 30MB file fails.
4. `supabaseAdmin.storage.from('attachments').createSignedUrl(storagePath, 3600)` returns a non-null `signedURL` (curl returns HTTP 200).
5. `pnpm --filter @drop-note/worker typecheck` exits 0.
6. `supabase/migrations/20240002000000_storage_bucket.sql` exists and is committed.

**Out of scope:**
- Signed URL generation for dashboard UI (Sprint 4)
- Deleting files on item deletion (Sprint 4)
- Virus scanning (v2)

---

### S206 — OpenAI GPT-4o-mini: email body summarization and tag extraction
**Type:** feat
**Points:** 3
**Depends on:** S204

**Goal:** Transform a raw email body into an AI-generated summary and suggested tags — the core value of drop-note, giving users organized, searchable content with no manual effort.

**Scope:**
- Create `packages/shared/src/prompts.ts`:
  ```ts
  export const SUMMARIZE_EMAIL_PROMPT = `
  You are a concise summarizer for a personal content-saving tool.
  Given the subject and body of an email the user forwarded to themselves, produce:
  1. A 2–4 sentence summary of the key information or reason the user saved this.
  2. A JSON array of 3–7 lowercase tag strings (single words or short hyphenated phrases).
     Examples: "recipe", "travel", "python", "machine-learning".

  Respond ONLY with a JSON object in this exact shape:
  { "summary": "...", "tags": ["...", "..."] }
  Do not include any text outside the JSON object.
  `

  export const IMAGE_DESCRIPTION_PROMPT = `
  You are a visual content indexer for a personal content-saving tool.
  Describe the image in 2–3 sentences focusing on important content, visible text,
  and subject matter that would help the user find it via keyword search.
  Respond with plain text only. No JSON.
  `
  ```
  Re-export from `packages/shared/src/index.ts`

- Create `apps/worker/src/lib/openai.ts`:
  - Export singleton `openaiClient` using `OPENAI_API_KEY`
  - Export `async function summarizeEmailBody(subject: string, bodyText: string): Promise<SummarizeResult>`:
    ```ts
    interface SummarizeResult {
      summary: string
      tags: string[]
      error: string | null
    }
    ```
    - Input: `Subject: ${subject}\n\n${bodyText}` truncated to 50,000 chars
    - Model: `gpt-4o-mini`, `response_format: { type: 'json_object' }`, `max_tokens: 500`, `temperature: 0.3`
    - Parse JSON response; on parse failure return `{ summary: '', tags: [], error: 'Invalid AI response format' }`
    - On API error: return `{ summary: '', tags: [], error: error.message }`
    - Normalize tags: lowercase, trim, deduplicate, max 10

- Install `openai` in worker: `pnpm add openai --filter @drop-note/worker`
- Add `OPENAI_API_KEY` to `apps/worker/.env.example` and root `.env.example`

**Acceptance criteria:**
1. `summarizeEmailBody('Weekend Recipe', 'Great pasta with garlic...')` returns non-empty `summary` and non-empty `tags` array.
2. All returned tags are lowercase: `tags.every(t => t === t.toLowerCase())`.
3. Passing 60,000 char body does not throw — silently truncated, API call succeeds.
4. With invalid `OPENAI_API_KEY`, function returns `{ summary: '', tags: [], error: '...' }` — no unhandled exception.
5. `cat packages/shared/src/prompts.ts` exports both `SUMMARIZE_EMAIL_PROMPT` and `IMAGE_DESCRIPTION_PROMPT`.
6. `pnpm --filter @drop-note/worker typecheck` exits 0.

**Out of scope:**
- Image description (S207)
- PDF summarization (S208 calls this same function after extracting text)
- Provider abstraction layer (Sprint 6)

---

### S207 — OpenAI Vision API: image description for image attachments
**Type:** feat
**Points:** 2
**Depends on:** S205, S206

**Goal:** Generate a searchable text description for image attachments so image content is discoverable in keyword search — giving image-heavy emails the same findability as text content.

**Scope:**
- Add `async function describeImage(base64Data: string, mimeType: string): Promise<DescribeResult>` to `apps/worker/src/lib/openai.ts`:
  ```ts
  interface DescribeResult {
    description: string
    error: string | null
  }
  ```
  - Cap: if `base64Data.length > 5 * 1024 * 1024`, return `{ description: '', error: 'Image too large for Vision API' }` — no API call
  - Data URL: `` `data:${mimeType};base64,${base64Data}` ``
  - Call `openaiClient.chat.completions.create`:
    - Model: `gpt-4o-mini`
    - Messages: system = `IMAGE_DESCRIPTION_PROMPT`, user = image_url content block with data URL
    - `max_tokens: 300`, `temperature: 0.2`
  - On error: return `{ description: '', error: error.message }`

- Update `apps/worker/src/processors/email.ts`:
  - For each attachment where `mimeType.startsWith('image/')`: call `describeImage`, store description as `ai_summary` on the attachment item

**Acceptance criteria:**
1. `describeImage` with a valid base64 JPEG returns a non-empty `description`.
2. `describeImage` with a decoded size > 5MB returns `{ description: '', error: 'Image too large...' }` without making an API call.
3. `describeImage` is never called for `application/pdf` or `text/*` attachments.
4. `pnpm --filter @drop-note/worker typecheck` exits 0.

**Out of scope:**
- Image resizing before upload (v2)
- EXIF/GPS metadata extraction (v2)

---

### S208 — PDF text extraction with pdf-parse
**Type:** feat
**Points:** 2
**Depends on:** S205, S206

**Goal:** Extract readable text from PDF attachments and feed it to the AI summarizer so PDF content is tagged and searchable just like email bodies.

**Scope:**
- Install: `pnpm add pdf-parse --filter @drop-note/worker` + `pnpm add -D @types/pdf-parse --filter @drop-note/worker`
- Create `apps/worker/src/lib/pdf.ts`:
  ```ts
  interface PdfExtractResult {
    text: string
    error: string | null
  }
  export async function extractPdfText(base64Data: string): Promise<PdfExtractResult>
  ```
  - Decode: `Buffer.from(base64Data, 'base64')`
  - Call `pdfParse(buffer)` → extract `data.text`
  - Truncate to 50,000 characters
  - On error (corrupt/encrypted): catch and return `{ text: '', error: error.message }`

- Update `apps/worker/src/processors/email.ts`:
  - For each attachment where `mimeType === 'application/pdf'`:
    1. Call `extractPdfText`
    2. If error: `setItemFailed(itemId, error)` — skip AI
    3. If text: call `summarizeEmailBody(filename, text)` → store summary + tags

**Acceptance criteria:**
1. `extractPdfText` with a real PDF returns non-empty text containing words from the PDF.
2. `extractPdfText` with garbage data returns `{ text: '', error: '...' }` — no throw.
3. A 200-page PDF producing > 50,000 chars returns `text.length === 50000`.
4. End-to-end: forwarding an email with a PDF attachment results in a DB item with non-null `ai_summary`.
5. `pnpm --filter @drop-note/worker typecheck` exits 0.

**Out of scope:**
- Word/DOCX extraction (v2)
- OCR for scanned PDFs (v2)

---

### S209 — Item and tag persistence with status transitions
**Type:** feat
**Points:** 3
**Depends on:** S205, S206, S207, S208

**Goal:** Write all processed items and AI-generated tags to the database with correct status transitions and idempotent tag upserts, completing the pipeline from inbound email to queryable data.

**Scope:**
- Create `apps/worker/src/lib/db.ts` with:

  **`createPendingItem(params): Promise<string>`** (returns `item_id`)
  - Insert `{ user_id, type, subject, sender_email, status: 'pending' }` into `public.items`
  - Called by `/api/ingest` before enqueuing — item visible immediately

  **`setItemProcessing(itemId: string): Promise<void>`**
  - `UPDATE public.items SET status = 'processing' WHERE id = $1`

  **`setItemDone(itemId: string, params: ItemDoneParams): Promise<void>`**
  - `UPDATE public.items SET status = 'done', ai_summary, storage_path, filename WHERE id = $1`

  **`setItemFailed(itemId: string, errorMessage: string): Promise<void>`**
  - `UPDATE public.items SET status = 'failed', error_message = $2 WHERE id = $1`

  **`upsertTags(userId: string, itemId: string, tagNames: string[]): Promise<void>`**
  - Normalize: `normalizeTags(tagNames)` from `@drop-note/shared` (S212)
  - For each tag: upsert into `public.tags` with `ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = EXCLUDED.name RETURNING id`
  - Insert into `public.item_tags (item_id, tag_id)` with `ON CONFLICT DO NOTHING`
  - Wrap all tag writes in a single transaction

- Update `apps/worker/src/processors/email.ts` to orchestrate full pipeline:
  1. `setItemProcessing(bodyItemId)`
  2. `summarizeEmailBody` → `setItemDone` → `upsertTags`
  3. For each attachment: create pending item → `setItemProcessing` → upload (S205) → AI step (S206/S207/S208) → `setItemDone` or `setItemFailed` → `upsertTags`
  4. On unhandled exception: `setItemFailed` on all in-flight items, rethrow (BullMQ retries)

- Update `EmailJobPayload` in `packages/shared/src/queue.ts` to include `bodyItemId: string`
- Update `/api/ingest` to call `createPendingItem` before enqueuing and pass `bodyItemId` in the payload

**Acceptance criteria:**
1. After job completes: `SELECT status, ai_summary FROM public.items WHERE id = '<body_item_id>'` → `status = 'done'`, non-null `ai_summary`.
2. `SELECT name FROM public.tags WHERE user_id = '<user_id>'` returns ≥ 1 row after first email processed.
3. `SELECT * FROM public.item_tags WHERE item_id = '<body_item_id>'` returns ≥ 1 row.
4. Sending the same tag name with different casing from two emails results in exactly one `public.tags` row — `UNIQUE(user_id, lower(name))` enforced.
5. When `summarizeEmailBody` errors, the body item is marked `status = 'failed'` with non-null `error_message`.
6. `pnpm --filter @drop-note/worker typecheck` exits 0.

**Out of scope:**
- Item cap enforcement (Sprint 3)
- Monthly `usage_log` writes (Sprint 3)
- Soft-delete logic (Sprint 4)
- FTS `tsvector` column (Sprint 4)

---

### S210 — Welcome email on first sign-in via Resend
**Type:** feat
**Points:** 1
**Depends on:** S106

**Goal:** Send each new user a welcome email containing their drop address immediately on first sign-in so they have it at hand without revisiting the dashboard.

**Scope:**
- Create Resend account, obtain API key, add sending domain (e.g. `notifications.dropnote.com`) with required DNS records
- Env vars: `RESEND_API_KEY`, `RESEND_FROM_ADDRESS` (e.g. `drop-note <hello@notifications.dropnote.com>`)
  - Add to `apps/web/.env.local`, Vercel env vars, and root `.env.example`
- Install: `pnpm add resend --filter @drop-note/web`
- Create `apps/web/lib/email.ts`:
  - Export `async function sendWelcomeEmail(toEmail: string): Promise<void>`
  - Simple HTML body with: greeting, `drop@dropnote.com` prominently displayed, brief instructions, dashboard link
  - On Resend error: log and return — never throw (must not break sign-in flow)
- Update `apps/web/app/auth/callback/route.ts`:
  - After successful session exchange, fetch user
  - Check if first sign-in: `SELECT created_at FROM public.users WHERE id = $1` — if `Date.now() - new Date(created_at).getTime() < 30_000`
  - If first sign-in: call `sendWelcomeEmail(user.email)` — fire-and-forget (no `await`)
  - Redirect to `/dashboard` always, regardless of email outcome

**Acceptance criteria:**
1. New user completes magic link sign-in → receives welcome email containing `drop@dropnote.com` within 60 seconds.
2. Returning user signing in again does NOT receive a second welcome email.
3. With missing/invalid `RESEND_API_KEY`, auth callback still redirects to `/dashboard` without 500 error.
4. `pnpm --filter @drop-note/web typecheck` exits 0.

**Out of scope:**
- Cap exceeded / processing done notification emails (Sprint 3)
- React Email templates (plain HTML string is sufficient for v1)
- Unsubscribe management (v2)

---

### S211 — Deploy worker to Railway with Dockerfile
**Type:** setup
**Points:** 2
**Depends on:** S203, S209

**Goal:** Get the worker running as a persistent process in production so jobs enqueued by the Vercel-hosted `/api/ingest` route are actually consumed and processed — proving the end-to-end pipeline works.

**Scope:**
- Create `apps/worker/Dockerfile` (multi-stage, monorepo-aware):
  ```dockerfile
  FROM node:20-alpine AS base
  RUN npm install -g pnpm

  FROM base AS deps
  WORKDIR /app
  COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
  COPY packages/shared/package.json ./packages/shared/package.json
  COPY apps/worker/package.json ./apps/worker/package.json
  RUN pnpm install --frozen-lockfile --filter @drop-note/worker...

  FROM base AS builder
  WORKDIR /app
  COPY --from=deps /app/node_modules ./node_modules
  COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
  COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
  COPY packages/shared ./packages/shared
  COPY apps/worker ./apps/worker
  COPY tsconfig.base.json ./
  RUN pnpm --filter @drop-note/shared build
  RUN pnpm --filter @drop-note/worker build

  FROM node:20-alpine AS runner
  WORKDIR /app
  COPY --from=builder /app/apps/worker/dist ./dist
  COPY --from=builder /app/apps/worker/node_modules ./node_modules
  COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
  CMD ["node", "dist/index.js"]
  ```
  - Update `packages/shared/package.json` `"main"` to `"dist/index.js"` and add `"build": "tsc"` script

- Create a Railway project:
  - Link GitHub repo
  - Root directory: `/` (monorepo root)
  - Dockerfile path: `apps/worker/Dockerfile`
  - Environment variables: `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`

- Create Upstash Redis database (if not already done for S202):
  - Copy `ioredis`-compatible URL (`rediss://...`) → `REDIS_URL` in Railway
  - Copy REST URL + REST Token → `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel

- End-to-end smoke test:
  1. Send a real email from a registered user to `drop@dropnote.com`
  2. Verify job appears in Upstash queue
  3. Verify Railway logs show `Processing job <id>`
  4. Verify `SELECT status, ai_summary FROM public.items ORDER BY created_at DESC LIMIT 1` shows `status = 'done'` within 30 seconds

**Acceptance criteria:**
1. `docker build -f apps/worker/Dockerfile -t drop-note-worker .` (from repo root) completes without errors.
2. Railway dashboard shows worker service as "Active" (no crash loop).
3. Railway logs show `Worker started, listening on queue: email-pipeline` on boot.
4. Sending a real email results in a `public.items` row with `status = 'done'` and non-null `ai_summary` within 30 seconds.
5. Railway restart policy is set to "on failure."
6. Upstash dashboard shows 0 jobs in `email-pipeline` queue after smoke test (job consumed).

**Out of scope:**
- Horizontal worker scaling (v2)
- Worker health check HTTP endpoint (Sprint 5)
- `docker compose` for local dev (Sprint 6)
- Separate staging environment (v2)

---

### S212 — Unit tests for pure functions in the email pipeline
**Type:** test
**Points:** 3
**Depends on:** S204, S206, S209

**Goal:** Lock in the behavior of every pure function in the pipeline with fast, dependency-free tests so that parsing, size-enforcement, rate-limit, and tag-deduplication logic can never silently regress.

**Scope:**
- **Extract pure helpers into `packages/shared`** (before writing tests):

  `packages/shared/src/ratelimit.ts`:
  ```ts
  export function getRateLimitThreshold(tier: 'free' | 'pro' | 'power'): number
  // free → 5, pro/power → 20

  export function isOverRateLimit(count: number, tier: 'free' | 'pro' | 'power'): boolean
  // count > threshold
  ```
  Update `/api/ingest` to use `isOverRateLimit` from `@drop-note/shared`

  `packages/shared/src/tags.ts`:
  ```ts
  export function normalizeTags(tags: string[]): string[]
  // lowercase, trim, deduplicate, remove empty strings, preserve order
  ```
  Update `upsertTags` in `apps/worker/src/lib/db.ts` to use `normalizeTags`

  Re-export both from `packages/shared/src/index.ts`

- **`packages/shared/src/__tests__/email.test.ts`** (≥ 8 test cases):
  - `parseFromAddress('"Alice <alice@Example.COM>"')` → `"alice@example.com"`
  - `parseFromAddress('bob@example.com')` → `"bob@example.com"`
  - `parseFromAddress('')` → `""` — no throw
  - `parseSendGridPayload` with empty `attachment-info` → `attachments.length === 0`
  - `parseSendGridPayload` with one PDF + one ZIP → `attachments.length === 1` (ZIP filtered)
  - `parseSendGridPayload` with 60,000 char body → `bodyText.length === 50000`
  - `parseSendGridPayload` with empty `subject` → `subject === "(no subject)"`
  - `countItems` with 0 attachments → `1`; with 3 → `4`
  - `enforceAttachmentSizeLimit({ size: 5_000_000 }, 'free')` → `true`
  - `enforceAttachmentSizeLimit({ size: 11_000_000 }, 'free')` → `false`
  - `enforceAttachmentSizeLimit({ size: 26_000_000 }, 'pro')` → `false`
  - `enforceAttachmentSizeLimit({ size: 26_000_000 }, 'power')` → `true`

- **`packages/shared/src/__tests__/ratelimit.test.ts`** (≥ 6 test cases):
  - `getRateLimitThreshold('free')` → `5`
  - `getRateLimitThreshold('pro')` → `20`
  - `getRateLimitThreshold('power')` → `20`
  - `isOverRateLimit(5, 'free')` → `false` (at limit = still allowed)
  - `isOverRateLimit(6, 'free')` → `true`
  - `isOverRateLimit(20, 'pro')` → `false`
  - `isOverRateLimit(21, 'pro')` → `true`

- **`packages/shared/src/__tests__/tags.test.ts`** (≥ 5 test cases):
  - `normalizeTags(['Python', 'python', 'PYTHON'])` → `['python']`
  - `normalizeTags(['  Machine Learning  '])` → `['machine learning']`
  - `normalizeTags(['tag1', '', 'tag2'])` → `['tag1', 'tag2']`
  - `normalizeTags([])` → `[]`
  - `normalizeTags(['a', 'b', 'a', 'B'])` → `['a', 'b']` (order preserved, dupes removed)

- **`packages/shared/src/__tests__/queue.test.ts`** (≥ 2 test cases):
  - `QUEUE_NAME === 'email-pipeline'`
  - TypeScript: assign a valid `EmailJobPayload` shape and confirm it compiles (compile-time test via `satisfies`)

**Acceptance criteria:**
1. `pnpm --filter @drop-note/shared test` exits 0 with ≥ 20 passing test cases.
2. `pnpm turbo test` exits 0 across all packages.
3. `normalizeTags(['Python', 'python'])` → `['python']` is a passing assertion.
4. `isOverRateLimit(6, 'free')` → `true` and `isOverRateLimit(5, 'free')` → `false` are both passing.
5. `pnpm turbo typecheck` exits 0 after all new `packages/shared/src/` files are added.
6. GitHub Actions CI passes on a PR containing all S212 changes.

**Out of scope:**
- Integration tests against real Redis or Supabase (unit tests only)
- Mocking the OpenAI SDK (tested via S211 end-to-end smoke test)
- Coverage threshold gate (Sprint 4)
- Playwright tests for ingest flow (Sprint 6)

---

## Summary

| Ticket | Title | Type | Points | Depends on |
|---|---|---|---|---|
| S201 | SendGrid Inbound Parse setup | setup | 2 | S110 |
| S202 | `/api/ingest` Next.js route handler | feat | 3 | S201, S203 |
| S203 | `apps/worker` scaffold with BullMQ and Redis | setup | 2 | S101 |
| S204 | Email parsing: extract subject, body, and attachments | feat | 2 | S203 |
| S205 | File upload to Supabase Storage with tier size enforcement | feat | 3 | S204 |
| S206 | OpenAI GPT-4o-mini: summarization and tag extraction | feat | 3 | S204 |
| S207 | OpenAI Vision API: image description for image attachments | feat | 2 | S205, S206 |
| S208 | PDF text extraction with pdf-parse | feat | 2 | S205, S206 |
| S209 | Item and tag persistence with status transitions | feat | 3 | S205, S206, S207, S208 |
| S210 | Welcome email on first sign-in via Resend | feat | 1 | S106 |
| S211 | Deploy worker to Railway with Dockerfile | setup | 2 | S203, S209 |
| S212 | Unit tests for pure functions in the email pipeline | test | 3 | S204, S206, S209 |
| **Total** | | | **29** | |
