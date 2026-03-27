# Sprint 3 — Review Notes

## Completed & verified end-to-end
- Stripe checkout (Pro upgrade) ✅
- Stripe webhook → `users.tier` update ✅
- Email ingest on paid tier ✅
- `/pricing` page with "Current plan" badge ✅
- Item cap enforcement (unit tested) ✅
- Monthly save action limit (unit tested) ✅
- Cap-exceeded notification email (code complete) ✅
- Admin tier override endpoint ✅
- Billing portal route ✅
- 77/77 unit tests passing ✅
- Full typecheck clean ✅

## Manual tests skipped — add to pre-launch checklist

### Downgrade banner
- Set a user's tier to `free` via Supabase Studio while they have 21+ items
- Confirm `OverCapBanner` appears on the dashboard with correct count and links
- Confirm new ingest is rejected while over cap
- Delete items until under 20 → confirm banner disappears

### Cap-exceeded notification email
- Trigger a free user over their item cap via ingest
- Confirm rejection email arrives within 60 seconds
- Confirm second email within same hour is suppressed (Redis key `cap-exceeded:{userId}`)

### Monthly save action limit
- Set `saves:{userId}:{YYYY-MM}` Redis key to 29 via Upstash console
- Send a 2-item email → confirm rejection and notification email

## Known gaps (accepted for v1)
- `invoice.payment_failed` not handled — user keeps paid access until `customer.subscription.deleted` fires (Stripe dunning period). Flagged for v2.
- Vercel Production webhook endpoint needs its own registration + `STRIPE_WEBHOOK_SECRET` before launch (currently only local CLI secret is configured). Add to S6 launch checklist.
