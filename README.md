# drop-note

Save anything by email. AI organizes it.

Forward or email any content to your drop address — articles, links, files, images. An AI pipeline summarizes and tags each item automatically. Browse, search, and manage everything from a clean dashboard.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/YOUR_ORG/drop-note/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_ORG/drop-note/actions/workflows/ci.yml)

---

## How it works

1. Register on the dashboard
2. Email anything to `drop@dropnote.com` from your registered address
3. AI summarizes and tags it within seconds
4. Browse, search, and manage from your dashboard

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 + TypeScript + shadcn/ui + Tailwind |
| Database | Supabase (Postgres + RLS) |
| Auth | Supabase Auth (magic link) |
| Email Inbound | SendGrid Inbound Parse |
| Queue | BullMQ + Redis |
| AI | OpenAI GPT-4o-mini (SaaS); configurable via `.env` (self-hosted) |
| Email Sending | Resend |
| Payments | Stripe |
| Deployment | Vercel (web) + Railway (worker) |
| Self-hosted | Docker Compose |

---

## Self-hosted quickstart

**Requirements:** Node 20+, pnpm, Docker, a Supabase project, an inbound email webhook provider (SendGrid recommended).

```bash
git clone https://github.com/YOUR_ORG/drop-note.git
cd drop-note
cp .env.example .env.local
# Fill in .env.local with your credentials
pnpm install
pnpm --filter @drop-note/web dev
```

For the full self-hosted setup including the BullMQ worker and Docker Compose, see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Monorepo structure

```
drop-note/
├── apps/
│   ├── web/        # Next.js 14 dashboard (Vercel)
│   └── worker/     # BullMQ AI processing worker (Railway / Docker)
├── packages/
│   └── shared/     # Shared TypeScript types, helpers, prompts
├── supabase/
│   └── migrations/ # SQL migration files
├── e2e/            # Playwright end-to-end tests
└── docs/           # Architecture, sprint plans, design guide
```

---

## Tiers

| Tier | Items | Actions/month | Attachment size | Price |
|---|---|---|---|---|
| Free | 20 | 30 | 10MB | $0 |
| Pro | 100 | Unlimited | 25MB | $9.99/mo |
| Power | 500 | Unlimited | 50MB | $49.99/mo |

---

## Development

```bash
pnpm install          # install all workspace deps
pnpm turbo lint       # lint all packages
pnpm turbo typecheck  # typecheck all packages
pnpm test             # run unit tests (Vitest)
pnpm e2e              # run Playwright smoke tests
```

---

## License

[AGPL-3.0](./LICENSE) — free to self-host. SaaS available at [dropnote.com](https://dropnote.com).
