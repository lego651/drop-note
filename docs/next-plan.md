# drop-note: Next Steps & Market Analysis

> Summary of project review, competitive research, and strategic decisions made on 2026-04-02.

---

## 1. Project Status

All 6 sprints complete. The app is ~85-90% production ready.

### What's built and working
- Email ingestion via SendGrid webhook + BullMQ queue
- AI processing: summarization, auto-tagging, image description, PDF extraction (GPT-4o-mini)
- YouTube URL detection with thumbnail preview
- Full dashboard: 3 view modes (list, card, timeline), search, filtering, bulk ops
- Stripe integration: Free / Pro ($9.99) / Power ($49.99) tiers with enforcement
- Google OAuth, RLS on all 8 tables, rate limiting, blocklist
- Supabase Realtime for live item updates
- 162 test files, CI/CD via GitHub Actions
- Sentry error monitoring
- Docker support for self-hosting

### Blockers for public launch
- [ ] **Domain** — no custom domain yet. SendGrid Inbound Parse requires MX records. Currently using test Gmail via Make.com polling (wasteful).
- [ ] **AI error handling (P0)** — no `response.ok` check, no timeout, can't distinguish retryable vs non-retryable errors.
- [ ] **Dockerfile HOSTNAME** — Next.js binds to localhost inside container, breaking `docker compose up`.
- [ ] **Legal pages** — `/terms` and `/privacy` need real content.

---

## 2. Competitive Landscape

The "save it for later" space is **crowded and well-served**.

| Product | Share-to-email | AI Summary | AI Tags | Price |
|---------|---------------|------------|---------|-------|
| Readwise Reader | Yes | Yes | Yes | $7.99/mo |
| Matter | Yes | Yes | Yes | Free tier |
| Raindrop.io | Yes | No | Yes (auto) | $3/mo |
| Pocket (Mozilla) | Yes | No | Yes (auto) | Free / $4.99/mo |
| Instapaper | Yes | No | No | Free / $2.99/mo |
| Omnivore | Yes | No | No | Free (open source, shut down after ElevenLabs acquisition) |
| **drop-note** | Yes | Yes | Yes | Free tier |

### Key takeaway
Readwise Reader does essentially everything drop-note does, with years of brand equity, mobile apps, browser extensions, and integrations. Competing head-to-head on features is not viable.

### The one opening
Omnivore (the closest open-source competitor) was acquired by ElevenLabs and shut down as an independent product. There is a real gap for an **open-source, self-hostable** alternative in the post-Omnivore void.

---

## 3. Pricing Analysis

Current pricing ($9.99 Pro / $49.99 Power) is **not competitive**.

- Readwise Reader (the premium benchmark): $7.99/mo
- Raindrop Pro: $3/mo
- Pocket Premium: $4.99/mo
- $49.99/mo Power tier has no market for a personal content tool

### Decision: skip monetization for initial launch

Since the project is AGPL open source and self-hostable, charging upfront creates friction and confusion. The strategy:

1. **Launch 100% free hosted** with reasonable limits (20 items free tier)
2. See if anyone actually uses it
3. If traction appears (100+ active users), add a paid hosted tier using the "Plausible model":
   - Self-hosted: free forever, full features
   - Hosted (dropnote.com): $4.99/mo for convenience (we handle hosting, updates, uptime, email routing)
4. Don't invest in Stripe/pricing infrastructure until demand is validated

---

## 4. Target Audience

The realistic persona is narrow:

**Primary: The self-hosted / open-source developer**
- Active on r/selfhosted, Hacker News
- Values data ownership, distrusts VC-backed tools
- Willing to self-host or pay for a hosted open-source alternative
- Previously used Omnivore, now looking for a replacement

**Secondary: The indie technologist / newsletter reader**
- Reads 20+ newsletters, browning tabs daily
- Values simplicity (email-only interface = no extension to install)
- Frustrated by Pocket/Instapaper degradation

### Realistic market size
- Best case: 500-1,000 paying users (~$50-100K ARR)
- Not a venture-scale business, but meaningful as an indie product

---

## 5. Go/No-Go Decision

### Context
We have 4 other active projects (physio-os, trader-os, claude-wall, open-prop-firm). drop-note cannot justify significant time investment unless market demand is validated.

### Decision: minimal effort test

Invest **one weekend** to validate demand. If it works, continue. If not, keep as personal tool.

---

## 6. Minimal Launch Plan (1 Weekend)

### Day 1: Fix & Ship
- [ ] Buy a cheap domain (~$10/year)
- [ ] Set up SendGrid MX records + verify (1 hour)
- [ ] Remove Make.com Gmail polling (replace with direct SendGrid Inbound Parse)
- [ ] Fix Dockerfile HOSTNAME binding (30 min)
- [ ] Set pricing to free-only for launch (disable Stripe upgrade flow temporarily)
- [ ] Push to GitHub, ensure README + self-hosting docs are clean

### Day 2: Launch & Measure
- [ ] Write and post **Show HN**: "Show HN: drop-note -- open source, self-hostable email-to-dashboard content saver (AGPL)"
  - Angle: "Pocket is degrading, Omnivore shut down. I built this for myself, now open-sourcing it."
- [ ] Post on **r/selfhosted** (400K members, receptive to AGPL self-hosted tools)
- [ ] Post on **r/PKMS** and **r/productivity** (lower priority)
- [ ] Tweet/X thread with demo video (optional, if time permits)

### Success Metric
**50 signups within 2 weeks.** If hit, continue investing. If not, keep as personal tool and move on.

### What NOT to do
- Don't build a marketing machine before validation
- Don't add features (browser extension, mobile app) before demand is proven
- Don't spend more than one weekend on this launch attempt

---

## 7. If Validation Succeeds (Post-Launch Roadmap)

Only pursue these if the 50-signup milestone is hit:

1. **Add paid hosted tier** ($4.99/mo) using the Plausible model
2. **Fix P0 issues**: AI error handling, worker DB error handling
3. **Add legal pages** (terms, privacy — required for paid tier)
4. **Browser extension** (the #1 feature request from this market)
5. **Mobile share sheet integration** (share from any app → drop-note)
6. **Obsidian/Logseq integration** (the self-hosted crowd loves this)

---

## 8. Infrastructure Cost Notes (from today's analysis)

### Make.com (current email polling)
- Polling Gmail every 11 minutes = ~131 ops/day = burns 75% of free tier in 6 days
- **Action**: Remove Make.com entirely once SendGrid Inbound Parse is set up with a real domain

### Vercel CPU usage
- **claude-wall** was consuming 97% of Vercel free tier CPU (6h 30m / 4h limit)
- Root cause: two Inngest cron jobs running every 5 minutes (TraderRealtimeSync + PayoutSync)
- **Fixed**: changed both to once daily (commit `76fb698` on claude-wall, pushed 2026-04-02)
- **drop-note** uses only 12 minutes of CPU (3%) — not a concern

### Monthly costs (current)
| Service | Cost | Notes |
|---------|------|-------|
| Vercel | Free | Under limits after claude-wall fix |
| Supabase | Free | Under limits with 1 user |
| Upstash Redis | Free | Under limits after BullMQ polling fix |
| Railway (worker) | Free tier | Auto-deploys on push |
| Make.com | Free (remove soon) | Unnecessary middleman |
| OpenAI | ~$0.50/mo | GPT-4o-mini is cheap at low volume |
| **Total** | **~$0.50/mo** | |
