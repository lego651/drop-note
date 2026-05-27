# Email Pipeline Architecture

> **D11 (2026-05-26):** Migrated to synchronous processing. BullMQ queue and Railway worker removed.
> Revisit to async (QStash) when active hosted users >= 100 or `/api/ingest` p95 > 30s.

## Overview

```
User Gmail
    │
    │  sends email to drop@dropnote.me   (prod)
    ▼
SendGrid Inbound Parse
    │  parses raw email → structured multipart POST
    ▼
POST /api/ingest  (Next.js on Vercel, maxDuration=60)
    │
    ├─ auth: shared secret in ?key= query param
    ├─ user lookup: from address → public.users (Supabase)
    ├─ block list: public.block_list (Supabase)
    ├─ rate limit: Redis INCR/EXPIRE (Upstash REST)
    ├─ save action limit: Redis atomic Lua INCR (Upstash REST, free tier)
    ├─ item cap check: public.items count (Supabase)
    ├─ create item: public.items status=processing (Supabase)
    │
    └─ processEmail() — synchronous inline AI pipeline
            │
            ├─ [email body]
            │     └─ AI provider → summary + tags
            │           (OpenAI GPT-4o-mini default; Anthropic / Gemini via env)
            │
            ├─ [image attachments]
            │     └─ AI provider Vision → description
            │
            ├─ [PDF attachments]
            │     └─ pdf-parse → extract text → AI provider → summary
            │
            ├─ upload attachments → storage.attachments (Supabase Storage)
            │
            ├─ upsert tags → public.tags + public.item_tags (Supabase)
            │
            ├─ setItemDone → status=done, ai_summary written (Supabase)
            │
            └─ structured log emitted:
                  { event: 'ingest.completed', total_handling_ms, ai_processing_ms, ... }
```

---

## Tools & Responsibilities

| Tool | Role |
|---|---|
| **SendGrid Inbound Parse** | Receives inbound email, parses MIME, delivers structured POST to `/api/ingest` |
| **Vercel** | Hosts Next.js app including `/api/ingest` serverless function (maxDuration=60) |
| **Upstash Redis** | Rate limiting + save action counters via `@upstash/redis` REST client |
| **Supabase** | Postgres DB (items, tags, users), Storage (attachments), RLS auth |
| **OpenAI GPT-4o-mini** | Default AI provider — summarizes email body + PDFs, describes images |
| **Resend** | Sends notification emails (cap exceeded, save limit, welcome) |

---

## Key Decisions

**Why synchronous (D11)?**
Railway trial expired ($5/mo); worker had been dead since 2026-03-30. Moving AI calls inline
eliminates the operational footprint entirely. Vercel's 60s maxDuration comfortably covers
typical email processing. The `processEmail()` function is decoupled from the HTTP layer so
a QStash async wrapper is a future swap, not a rewrite.

**Single Redis client — why `@upstash/redis` REST only?**
No persistent TCP connection needed without BullMQ. `@upstash/redis` works in Vercel
serverless and stays within the Upstash free tier.

**Why always return HTTP 200 from `/api/ingest`?**
SendGrid retries any non-200 response. Unknown senders, blocked addresses, and rate-limited
users are all silently discarded with 200 to prevent retry storms.

**Retryable vs non-retryable AI errors**
On a transient AI error (e.g. OpenAI 500), the item is left at `status=pending` with a
placeholder summary — the user can re-send the email to reprocess. On a non-retryable error
(parse failure, 400), the item is marked `status=failed` with `error_message`.

**Stuck item from before D11 (item `4d3c37b7`, 2026-05-26)**
Jason's test email that landed while the worker was dead is stuck at `status=pending`. Simplest
fix: re-send the email. The new synchronous pipeline will process it immediately.
