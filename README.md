# drop-note

**Save anything from anywhere. Find it later.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/lego651/drop-note/actions/workflows/ci.yml/badge.svg)](https://github.com/lego651/drop-note/actions/workflows/ci.yml)

---

drop-note is an email-to-dashboard content saver. Email anything to `drop@dropnote.me` from your registered address and an AI pipeline automatically summarizes and tags it. Browse, search, pin, and manage everything from a clean web dashboard — no browser extension, no app to install.

Free. Open source (AGPL-3.0). Self-hostable.

---

<!-- TODO: add dashboard screenshot -->

---

## Use the hosted version

[dropnote.me](https://dropnote.me) — free, no credit card required.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + shadcn/ui + Tailwind |
| Database | Supabase (Postgres + RLS) |
| Auth | Supabase Auth (Google OAuth only) |
| File Storage | Supabase Storage |
| Email Inbound | SendGrid Inbound Parse |
| Queue | None — AI runs synchronously in `/api/ingest`; Upstash Redis for rate limiting |
| AI | OpenAI GPT-4o-mini (SaaS); configurable for self-hosted |
| Email Sending | Resend |
| Payments | Stripe (disabled at launch — reactivated at 100 active users) |
| Error Monitoring | Sentry |
| Deployment | Vercel |
| Monorepo | pnpm workspaces + Turborepo |

---

## Architecture

```mermaid
graph LR
    A[Email] --> B[SendGrid Inbound Parse]
    B --> C[/api/ingest]
    C --> F[OpenAI / Anthropic / Gemini]
    F --> G[Supabase DB]
    H[Dashboard\nNext.js] --> G
    G --> I[Supabase Realtime]
    I --> H
```

An inbound email hits SendGrid's Inbound Parse webhook, which POSTs the payload to `/api/ingest`. The route handler validates the sender, calls the configured AI provider synchronously to summarize and tag the content, and writes the result to Supabase. The dashboard receives the update in real time via Supabase Realtime.

---

## Self-hosting

### Prerequisites

| Service | Why | Free tier? |
|---|---|---|
| [Supabase](https://supabase.com) | Postgres database + auth + storage | Yes |
| [SendGrid](https://sendgrid.com) | Inbound Parse for email → webhook | Yes (100 emails/day) |
| [Resend](https://resend.com) | Outbound transactional email | Yes (3,000/mo) |
| [OpenAI](https://platform.openai.com) | GPT-4o-mini summarization + tagging | Pay-per-use (~$0.01/100 items) |
| [Vercel](https://vercel.com) | Hosting the Next.js dashboard | Yes (Hobby plan) |
| [Upstash](https://upstash.com) | Redis for rate limiting | Yes |

### Deploy in 10 minutes

**1. Clone and install**
```bash
git clone https://github.com/lego651/drop-note.git
cd drop-note
pnpm install
```

**2. Create a Supabase project**

Go to [supabase.com](https://supabase.com), create a new project, and copy:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Service role key → `SUPABASE_SERVICE_ROLE_KEY`

**3. Apply the database schema**
```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push --linked
```

**4. Configure Google OAuth**

In [Google Cloud Console](https://console.cloud.google.com):
- Create an OAuth 2.0 Client ID (Web Application)
- Add `https://<your-domain>/auth/callback` as an authorized redirect URI

In Supabase Dashboard → Authentication → Providers → Google:
- Paste your Client ID and Client Secret

**5. Configure SendGrid Inbound Parse**

- Add your domain's MX record: `MX @ → mx.sendgrid.net` (priority 10)
- In SendGrid Dashboard → Inbound Parse: set Host = your domain, URL = `https://<your-domain>/api/ingest?key=<SENDGRID_WEBHOOK_SECRET>`
- Set `SENDGRID_WEBHOOK_SECRET` env var (any random string)

**6. Configure Resend (outbound email)**

- Create a [Resend](https://resend.com) account and add your domain
- Copy the API key → `RESEND_API_KEY`
- Set `RESEND_FROM_EMAIL` = `hello@<your-domain>`

**7. Set environment variables**

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in all values:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `OPENAI_API_KEY` | OpenAI API key (GPT-4o-mini) |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | From address (e.g. `hello@yourdomain.com`) |
| `SENDGRID_WEBHOOK_SECRET` | Random secret for webhook auth |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL (rate limiting) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |
| `CRON_SECRET` | Random secret for cron job auth |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL |

**8. Deploy to Vercel**
```bash
vercel --prod
```

Or connect your GitHub repo to Vercel for automatic deploys on every push to `main`.

### Self-host vs hosted

| | Self-hosted | Hosted (dropnote.me) |
|---|---|---|
| Cost | Your infra costs | Free |
| Data location | Your Supabase | Supabase (US) |
| Updates | Manual pull + redeploy | Automatic |
| Item limit | Configurable | 50 items (free tier) |
| License | AGPL-3.0 | AGPL-3.0 |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for prerequisites, local dev setup, code conventions, and the PR process.

---

## License

drop-note is licensed under the [GNU Affero General Public License v3.0](LICENSE).

If you run a modified version of drop-note as a network service, you must make your modified source code available to users of that service under the same license.
