# Email Pipeline Architecture

## Overview

```
User Gmail
    │
    │  sends email to legogao651@gmail.com (dev)
    │  sends email to drop@dropnote.com   (prod, post-domain)
    ▼
SendGrid Inbound Parse
    │  parses raw email → structured multipart POST
    ▼
POST /api/ingest  (Next.js on Vercel)
    │
    ├─ auth: shared secret in ?key= query param
    ├─ user lookup: from address → public.users (Supabase)
    ├─ block list: public.block_list (Supabase)
    ├─ rate limit: Redis INCR/EXPIRE (Upstash)
    ├─ create pending item: public.items status=pending (Supabase)
    └─ enqueue job → BullMQ queue (Upstash Redis)
            │
            ▼
    BullMQ Worker  (Node.js on Railway)
            │
            ├─ setItemProcessing → status=processing
            │
            ├─ [email body]
            │     └─ GPT-4o-mini → summary + tags (OpenAI)
            │
            ├─ [image attachments]
            │     └─ GPT-4o-mini Vision → description (OpenAI)
            │
            ├─ [PDF attachments]
            │     └─ pdf-parse → extract text → GPT-4o-mini → summary
            │
            ├─ upload attachments → storage.attachments (Supabase Storage)
            │
            ├─ upsert tags → public.tags + public.item_tags (Supabase)
            │
            └─ setItemDone → status=done, ai_summary written (Supabase)
```

---

## Tools & Responsibilities

| Tool | Role |
|---|---|
| **SendGrid Inbound Parse** | Receives inbound email, parses MIME, delivers structured POST to `/api/ingest` |
| **Vercel** | Hosts Next.js app including `/api/ingest` serverless function |
| **Upstash Redis** | Dual use: rate limiting (REST API via `@upstash/redis`) + BullMQ job queue (ioredis) |
| **Railway** | Hosts the persistent BullMQ worker process (can't run on Vercel serverless) |
| **Supabase** | Postgres DB (items, tags, users), Storage (attachments), RLS auth |
| **OpenAI GPT-4o-mini** | Summarizes email body + PDFs, describes images via Vision API |
| **Resend** | Sends welcome email on first sign-in (outbound only) |

---

## Key Decisions

**Why two Redis clients?**
`@upstash/redis` (REST) works in Vercel serverless for rate limiting. BullMQ requires a persistent TCP connection (`ioredis`) — only viable in the Railway worker.

**Why a separate worker process?**
Vercel functions time out at 10–60s and don't hold persistent connections. The worker needs both — Railway runs it as a long-lived Node.js process.

**Why always return HTTP 200 from `/api/ingest`?**
SendGrid retries any non-200 response. Unknown senders, blocked addresses, and rate-limited users are all silently discarded with 200 to prevent retry storms.

**Dev vs prod inbound address**
Dev: `legogao651@gmail.com` (manual curl simulation — no MX records needed).
Prod: `drop@dropnote.com` (requires MX record + SendGrid Inbound Parse config — done last before launch).
