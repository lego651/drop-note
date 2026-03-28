# Production Launch Checklist

> Run through this checklist manually before announcing the beta.

---

## Pre-domain testing (current state — no domain yet)

The full email pipeline (real email → SendGrid → `/api/ingest`) requires MX records on `dropnote.com`, which isn't acquired yet. Until then, use curl to simulate a SendGrid Inbound Parse POST directly.

**How to simulate an inbound email:**

```bash
curl -X POST "https://drop-note-pi.vercel.app/api/ingest?key=YOUR_SENDGRID_WEBHOOK_SECRET" \
  -F "from=jasonusca@gmail.com" \
  -F "to=legogao651@gmail.com" \
  -F "subject=Test email subject" \
  -F "text=This is the email body content that will be summarized by AI." \
  -F "envelope={\"from\":\"jasonusca@gmail.com\",\"to\":[\"legogao651@gmail.com\"]}"
```

- Replace `YOUR_SENDGRID_WEBHOOK_SECRET` with the value of `SENDGRID_WEBHOOK_SECRET` in your Vercel env vars
- Replace `jasonusca@gmail.com` with any registered user's email — unregistered senders are silently dropped
- A successful call returns `{"ok":true}` and the item appears in the dashboard within ~30s

**To add attachments (image or PDF):**
```bash
curl -X POST "https://drop-note-pi.vercel.app/api/ingest?key=YOUR_SENDGRID_WEBHOOK_SECRET" \
  -F "from=jasonusca@gmail.com" \
  -F "to=legogao651@gmail.com" \
  -F "subject=Email with attachment" \
  -F "text=See attached." \
  -F "attachment1=@/path/to/file.pdf" \
  -F "attachment-info={\"attachment1\":{\"filename\":\"file.pdf\",\"type\":\"application/pdf\",\"name\":\"file.pdf\"}}" \
  -F "envelope={\"from\":\"jasonusca@gmail.com\",\"to\":[\"legogao651@gmail.com\"]}"
```

---

## Infrastructure
- [ ] `dropnote.com` domain acquired
- [ ] MX records configured on domain pointing to SendGrid

  **How to do this once you have the domain:**
  1. In SendGrid → Settings → **Sender Authentication** → authenticate `dropnote.com` (generates SPF/DKIM DNS records)
  2. Add those DNS records in your domain registrar
  3. In SendGrid → Settings → **Inbound Parse** → click **Add Host & URL**:
     - Hostname: `dropnote.com`
     - URL: `https://dropnote.com/api/ingest?key=YOUR_SENDGRID_WEBHOOK_SECRET`
     - Check "Send Raw" OFF (structured parse is what the code expects)
     - Check "Spam Check" ON
  4. At your domain registrar, add MX record:
     - Host: `@` (or `dropnote.com`)
     - Value: `mx.sendgrid.net`
     - Priority: `10`
  5. Wait for DNS propagation (5 min – 48 hrs). Test with SendGrid's "Send Test" button.
  6. Send a real email to `drop@dropnote.com` and confirm it appears in the dashboard.

- [ ] SendGrid Inbound Parse webhook URL set to `https://dropnote.com/api/ingest?key=YOUR_SENDGRID_WEBHOOK_SECRET`
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
- [ ] Google Cloud Console OAuth app created with production domain
- [ ] Supabase → Authentication → Providers → Google enabled (Client ID + Secret)
- [ ] Supabase → Authentication → User Management → "Allow linking multiple providers" enabled
- [ ] Authorized redirect URI includes: `https://<ref>.supabase.co/auth/v1/callback`
- [ ] Authorized JavaScript origins include production domain + Vercel preview domain
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
- [ ] Register a new account → click "Continue with Google" → complete OAuth → land on `/items`
- [ ] Send email to `drop@dropnote.com` from registered address → item appears in dashboard within 30s
- [ ] Upgrade to Pro via Stripe (use live card) → tier changes to `pro` in Supabase
- [ ] Admin panel accessible with `is_admin` account
- [ ] Account deletion completes without error, user record removed
