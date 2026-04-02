# drop-note

> **[Next Plan: Market Analysis & Launch Strategy](docs/next-plan.md)** — competitive research, pricing decisions, and minimal launch plan.

**Email anything. Find it later.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/TODO-ORG/drop-note/actions/workflows/ci.yml/badge.svg)](https://github.com/TODO-ORG/drop-note/actions/workflows/ci.yml)

---

drop-note is an email-to-dashboard content saver. Email anything to `drop@dropnote.com` from your registered address and an AI pipeline automatically summarizes and tags it. Browse, search, pin, and manage everything from a clean web dashboard — no browser extension, no app to install.

Free tier available. Pro ($9.99/mo) and Power ($49.99/mo) plans for higher volume. Fully self-hostable under AGPL-3.0.

---

<!-- TODO: add dashboard screenshot -->

---

## Use the SaaS version

[dropnote.com](https://dropnote.com) — free tier, no credit card required.

---

## Self-hosted quickstart

You'll need Docker Desktop and a Supabase project (free tier works).

1. Clone the repo and copy the env template:
   ```bash
   git clone https://github.com/TODO-ORG/drop-note.git
   cd drop-note
   cp .env.example .env
   ```

2. Fill in `.env` with your Supabase URL, anon key, service role key, and any other required values (see `.env.example` for the full list).

3. Apply the database schema:
   ```bash
   npx supabase db push --linked
   ```

4. Start the stack:
   ```bash
   docker compose up
   ```

5. Open `http://localhost:3000`, register with your email, and send a test email to the ingest address configured in your `.env`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full local development guide.

---

## Architecture

```mermaid
graph LR
    A[Email] --> B[SendGrid Inbound Parse]
    B --> C[/api/ingest]
    C --> D[BullMQ Queue]
    D --> E[Worker]
    E --> F[OpenAI / Anthropic / Gemini]
    F --> G[Supabase DB]
    H[Dashboard\nNext.js] --> G
    G --> I[Supabase Realtime]
    I --> H
```

An inbound email hits SendGrid's Inbound Parse webhook, which POSTs the payload to `/api/ingest`. The route handler validates the sender, writes a pending item to Supabase, and enqueues a job in BullMQ (Redis). The worker picks up the job, calls the configured AI provider to summarize and tag the content, and writes the result back to Supabase. The dashboard receives the update in real time via Supabase Realtime.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + shadcn/ui + Tailwind |
| Database | Supabase (Postgres + RLS) |
| Auth | Supabase Auth (magic link — no passwords) |
| File Storage | Supabase Storage |
| Email Inbound | SendGrid Inbound Parse |
| Queue | BullMQ + Redis (Upstash) |
| AI | OpenAI GPT-4o-mini (SaaS); configurable for self-hosted |
| Email Sending | Resend |
| Payments | Stripe |
| Error Monitoring | Sentry |
| Deployment | Vercel (web) + Railway (worker) |
| Monorepo | pnpm workspaces + Turborepo |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for prerequisites, local dev setup, code conventions, and the PR process.

---

## License

drop-note is licensed under the [GNU Affero General Public License v3.0](LICENSE).

If you run a modified version of drop-note as a network service, you must make your modified source code available to users of that service under the same license.
