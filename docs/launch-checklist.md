# Production Launch Checklist

> Run through this checklist manually before announcing the beta.

## Infrastructure
- [ ] `dropnote.com` domain acquired
- [ ] MX records configured on domain pointing to SendGrid
- [ ] SendGrid Inbound Parse webhook URL set to `https://dropnote.com/api/ingest`
- [ ] SendGrid domain authentication (SPF/DKIM) verified
- [ ] Vercel project linked to production domain
- [ ] All Vercel env vars set to production values (not test values, not `.env.example` examples)
- [ ] Railway worker deployed with production env vars
- [ ] Upstash Redis URLs configured in Railway + Vercel
- [ ] `CRON_SECRET` set in Vercel env vars (required for purge-trash cron job)

## Stripe
- [ ] Stripe live mode enabled (not test mode)
- [ ] Pro product + price created in live mode; `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` set
- [ ] Power product + price created in live mode; `NEXT_PUBLIC_STRIPE_POWER_PRICE_ID` set
- [ ] Stripe webhook endpoint: `https://dropnote.com/api/webhooks/stripe`
- [ ] Webhook events registered: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] `STRIPE_WEBHOOK_SECRET` set to live mode webhook signing secret
- [ ] Ran a live test checkout end-to-end before opening beta

## Auth & Email
- [ ] Supabase Auth email provider configured (SMTP or Supabase-hosted email)
- [ ] Magic link redirect URL: `https://dropnote.com/auth/callback`
- [ ] Welcome email template live in Resend
- [ ] Resend domain verified for sending from `@dropnote.com`

## Monitoring
- [ ] Sentry DSN set for both `web` and `worker` environments
- [ ] Sentry alert rule: error rate > 1/min → notify
- [ ] Uptime monitor configured (Better Uptime or equivalent)

## Legal
- [ ] Terms of Service at `dropnote.com/terms` — contains substantive content (not placeholder)
- [ ] Privacy Policy at `dropnote.com/privacy` — contains GDPR Article 13 disclosures and 30-day erasure SLA (not placeholder text)
- [ ] Privacy Policy Section 1 updated with real data controller name/company (replace "the operator of this service")
- [ ] Founder has read and approved both legal pages (see S615)
- [ ] GDPR cookie consent banner live (if using cookies beyond strictly necessary)

## OSS & CI
- [ ] GitHub repo set to public
- [ ] AGPL `LICENSE` file present in repo root
- [ ] Vercel OSS application submitted (see S609) — approval date: ___
- [ ] `VERCEL_AUTOMATION_BYPASS_SECRET` configured in Vercel project (unblocks E2E on preview URLs)
- [ ] GitHub Actions CI fully green on `main`
- [ ] GitHub Projects public roadmap board created

## Final Smoke Test (manual — run once before beta)
- [ ] Register a new account → receive magic link email → click → land on `/items`
- [ ] Send email to `drop@dropnote.com` from registered address → item appears in dashboard within 30s
- [ ] Upgrade to Pro via Stripe (use live card) → tier changes to `pro` in Supabase
- [ ] Admin panel accessible with `is_admin` account
- [ ] Account deletion completes without error, user record removed
