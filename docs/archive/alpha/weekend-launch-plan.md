# drop-note Weekend Launch Plan — April 12-13, 2026

**Goal:** Ship drop-note as a public, open-source product in 2 weekends. First product launch ever. Also a learning exercise for future higher-stakes launches (physio-os, snap-trade).

**Timebox:** Done by May 1. If not live by then, stop and move on.

**Positioning (revised after marketing review):**
> "Omnivore shut down. drop-note is the open-source, self-hostable alternative. Email anything — AI summarizes and tags it automatically."

The Omnivore angle is the lead, not a footnote. There's an active community of displaced users with existing pain, existing behavior, and no home.

---

## Part 1: Pre-Launch Audit Summary

### What's Working
- Core email -> AI -> dashboard pipeline is functional
- Google OAuth authentication
- 3 view modes (list, card, timeline), search, filtering, bulk operations
- YouTube URL detection with thumbnails
- Supabase Realtime for live updates
- CI/CD via GitHub Actions (lint, typecheck, test, e2e)
- Sentry error monitoring (web app)
- Docker multi-stage builds (HOSTNAME issue already fixed)
- AGPL-3.0 license
- Solid CONTRIBUTING.md
- Privacy policy and Terms of Service (substantive, not placeholder)
- Stripe integration exists but can be bypassed for free launch

### What's Broken / Missing
- No custom domain (dropnote.com or alternative not purchased)
- AI error handling has no `response.ok` check, no timeout, no retry logic
- `TODO-ORG` placeholder in README badges and clone URLs
- Personal email addresses in docs/
- `.claude/` directory (772MB) not gitignored
- Internal planning files at repo root not gitignored
- No dashboard screenshot in README
- No GitHub issue templates
- Privacy Policy data controller is placeholder
- Worker .env.example is incomplete
- No supported platforms list on site
- No new-user onboarding (empty dashboard, no instructions)
- Stripe is integrated but unnecessary for free launch

---

## Part 2: Scope Decisions

### Stripe — DISABLE, Don't Remove

- Do NOT rip out Stripe code. Just don't configure the env vars.
- **IMPORTANT (PM review):** Verify all Stripe initialization is gated behind a null check on the API key. If env vars are missing and code tries to initialize Stripe, it will throw runtime errors on any code path that touches Stripe, not just payment buttons. This must be tested.
- Set a **hard limit of 50 items per user** (raised from 20 — see PM rationale below).
- Add a **banner** when user hits 40/50 items: "You've used 40 of 50 free saves. Want more? Contact us at [email]"
- At 50/50: "You've reached the free limit. Email us to discuss upgrading."
- No payment flow. Manual outreach if anyone actually hits the limit.

**Why 50, not 20 (PM challenge):** 20 items is not enough for users to experience the core value loop. A power user testing the product hits that ceiling in one sitting before the habit forms. You want users to reach "aha" first, then hit the wall. At 50 items, AI cost is still negligible ($0.30 for 100 users), but the retention signal from users who save 30-40 items is far more valuable than catching people at 20.

### Supported Platforms — What Works Today

**PM challenge: Be honest about "Any URL" support.** The worker processes URLs, but if the AI only sees the URL string (not the page content), the "summary" is generated from the URL text alone, not the actual content. Verify what actually happens with a generic URL and document it honestly. Misrepresenting capabilities on day one destroys trust.

| Platform | Status | How It Works |
|----------|--------|-------------|
| **Email (any)** | Supported | Forward any email -> AI summarizes + tags |
| **YouTube** | Supported | Paste URL in email body -> extracts title, thumbnail, video ID |
| **Any URL** | Basic | Link is stored; AI summarizes from email context (not page content) |
| **PDF attachments** | Supported | Attach PDF -> text extracted + AI summarized |
| **Image attachments** | Supported | Attach image -> AI vision description (GPT-4o-mini) |
| **Text attachments** | Supported | Attach .txt, .md, etc. -> content extracted + summarized |
| Twitter/X | Requested | Vote on GitHub to prioritize |
| Reddit | Requested | Vote on GitHub to prioritize |
| Instagram | Requested | Vote on GitHub to prioritize |
| Hacker News | Requested | Vote on GitHub to prioritize |
| Podcast | Requested | Vote on GitHub to prioritize |
| RSS | Requested | Vote on GitHub to prioritize |

**On the site:** Add a "Supported Platforms" section with this matrix. Each "Requested" row links to a GitHub issue (using platform request template) where users can upvote.

### New User Onboarding (PM flag — CRITICAL)

**The PM identified this as the highest-churn moment.** New users sign up, land on an empty dashboard, have no idea what the drop email address is, and leave. Must build:

- **First-visit modal/welcome card:** "Welcome to drop-note! Forward any email to `drop@[domain]` and it'll appear here automatically. Try it now!"
- **Empty state on dashboard:** Not a blank page. Show the drop email address prominently, a quick-start guide (3 steps), and example of what a saved item looks like.
- **Optional: Welcome email** after signup with the drop address and quick instructions.

This is non-negotiable before launch. Without it, every signup from HN/Reddit churns immediately.

### PostHog — Why and Cost

**Why PostHog over Google Analytics:**
- **Product analytics, not just traffic.** Events, funnels, user journeys, retention.
- **Session replay** (free tier) — watch exactly what users do on launch day.
- **No cookie consent needed** — can run cookieless, avoiding GDPR banner complexity.
- **Self-hostable** — aligns with drop-note's open-source ethos.

**Cost: FREE.** 1M events/month, 5,000 session recordings. drop-note will use <1% for months.

**Event taxonomy (expanded after PM review):**

| Event | When | Why Track |
|-------|------|-----------|
| `user_signed_up` | After Google OAuth complete | Acquisition |
| `item_saved` | Email ingested + processed | Core activation metric |
| `item_saved_source` | With source_type property (email/youtube/url/pdf/image) | Know what platforms people use |
| `item_opened` | User clicks/opens a saved item | **Did they ever read what they saved?** |
| `dashboard_viewed` | Dashboard page load | Engagement |
| `session_returned` | Return visit (day 2, day 7) | **Retention — the most important metric for save-for-later** |
| `email_forwarding_first` | First item_saved after signup | **Gap between signup and activation** |
| `item_searched` | User searches | Feature usage |
| `item_pinned` | User pins an item | Engagement depth |
| `item_deleted` | User deletes | Churn signal if frequent |
| `limit_warning_shown` | 40/50 banner displayed | Monetization funnel top |
| `limit_reached` | 50/50 banner displayed | Monetization conversion point |
| `view_mode_changed` | Switch list/card/timeline | UX preference |
| `self_host_docs_viewed` | Clicks self-hosting docs | How many try to self-host |

### AI Auto-Research Marketing Agent

**CEO + Marketing verdict: Phase 2 (automated agent) is cut from the 2-weekend scope.** It adds meaningful engineering work on top of an already-full sprint. Ship the product, get real users, then automate.

**Phase 1 only (manual + AI-drafted content):**
- AI generates launch post drafts tailored to each community
- Track which posts drive signups via PostHog referral source
- This is all you need for the first 30 days

**Phase 2 (automated agent) — starts 30+ days post-launch:**
- Only after you have real PostHog data and Google Search Console indexed
- Vercel Cron Job triggers AI agent for weekly analysis
- Agent monitors: search keywords, referral sources, community mentions
- Generates weekly report with suggested actions
- All findings stored in Supabase
- **This becomes the V-Health demo:** "AI marketing grew drop-note traffic by X%"

---

## Part 3: Open-Source Readiness Checklist

Based on analysis of Qclaw (2.1k stars) and nodepad (606 stars) repos:

### README Overhaul
- [ ] Replace `TODO-ORG` with real GitHub org/username everywhere (badges, clone URLs)
- [ ] Add dashboard screenshot (take one, put in `docs/images/`)
- [ ] **Lead with Omnivore angle:** "Omnivore shut down. drop-note is the open-source alternative."
- [ ] Add a demo video or GIF (even a 30-second screen recording)
- [ ] Add "Supported Platforms" table (honest version from Part 2)
- [ ] Add badges: license, CI status, deploy status
- [ ] Remove link to `docs/next-plan.md` from README (internal strategy doc)
- [ ] Add "Self-Hosted vs Hosted" section explaining both options

### Repo Hygiene
- [ ] Add `.claude/` to `.gitignore`
- [ ] Add `findings.md`, `progress.md`, `task_plan.md` to `.gitignore`
- [ ] Review `CLAUDE.md` — either gitignore or sanitize for public
- [ ] Replace personal emails (`jasonusca@gmail.com`, `legogao651@gmail.com`) in docs/ with `your-email@example.com`
- [ ] Review `docs/next-plan.md` — remove personal strategy notes, competitor cost breakdowns, or move to private doc
- [ ] Update worker `.env.example` to match root `.env.example` completeness
- [ ] Fill in Privacy Policy data controller name (personal name or company)

### GitHub Community Files
- [ ] Add bug report issue template (`.github/ISSUE_TEMPLATE/bug_report.yml`)
- [ ] Add feature request issue template (`.github/ISSUE_TEMPLATE/feature_request.yml`)
- [ ] Add platform request issue template (`.github/ISSUE_TEMPLATE/platform_request.yml`)
- [ ] Add PR template (`.github/PULL_REQUEST_TEMPLATE.md`)
- [ ] Enable GitHub Discussions on the repo

### Code Changes
- [ ] Add AI error handling: `response.ok` check, timeout (30s), distinguish retryable vs non-retryable
- [ ] Verify Stripe SDK init is gated behind null check — no runtime crash when env vars missing
- [ ] Implement hard 50-item limit for free tier (verify existing tier enforcement)
- [ ] Add limit warning banner at 40/50 items
- [ ] Add limit reached banner at 50/50 with contact email
- [ ] Disable Stripe upgrade buttons (hide or show "Coming soon")
- [ ] **Build new-user onboarding: welcome modal + empty state with drop address + quick-start guide**
- [ ] Add "Supported Platforms" page/section on the site
- [ ] Add "Request a Platform" button -> opens GitHub issue from template
- [ ] Integrate PostHog (web app): install SDK, instrument full event taxonomy
- [ ] Add PostHog to .env.example
- [ ] Add "Did your item arrive?" helper on empty dashboard ("Sent your first email? It usually arrives within 2 minutes. Nothing yet? Check FAQ")

### Domain & Infrastructure
- [ ] Buy domain (dropnote.co, dropnote.app, or alternative — check availability)
- [ ] Configure DNS on Vercel
- [ ] Configure SendGrid MX records for inbound email
- [ ] Set up the actual drop email address (e.g., drop@dropnote.app)
- [ ] Update all references to the drop email address in code and docs
- [ ] **Test email deliverability with Gmail, Outlook, ProtonMail, and Yahoo** — define pass criteria
- [ ] Verify end-to-end: send email -> appears on dashboard (all content types)
- [ ] Set up Google Search Console for the domain

---

## Part 4: Market Release Plan

### Target Audience (reordered after marketing review)
1. **Ex-Omnivore users** — active pain, existing behavior, actively searching for alternatives
2. **Self-hosters** (r/selfhosted) — core audience for open-source tools
3. **Developers and technical productivity enthusiasts**

### Positioning
> "Omnivore shut down. drop-note is the open-source, self-hostable alternative. Email anything — AI summarizes and tags it automatically."

Key differentiators:
1. **Open-source** — Omnivore was acquired and shut down. There's a gap. drop-note fills it.
2. **Email-first** — No browser extension, no app to install. Just forward an email.
3. **AI-powered** — Not just storage. AI summarizes, tags, and describes everything automatically.
4. **Self-hostable** — Full Docker Compose setup. Own your data.

### Pre-Launch Community Seeding (Marketing flag — CRITICAL)

**The marketing review identified the #1 launch risk: Jason has no existing audience.** No HN karma history, no r/selfhosted reputation, no one to retweet. A cold launch post gets 3 upvotes and disappears.

**Fix (do during Weekend 1, not launch day):**
- [ ] Find 3-5 active Reddit threads where ex-Omnivore users are asking "what do I use now?" — post helpful comments (not self-promo, just participate)
- [ ] Comment helpfully in r/selfhosted on 2-3 threads about read-later or note-taking tools
- [ ] Reply in the Omnivore GitHub issues/discussions where users are looking for alternatives
- [ ] Post 1-2 tweets about building in public (problem you're solving, not the product yet)

This takes 1-2 hours but is the difference between a launch that gets traction and one that gets ignored.

### Launch Channels (revised)

| Channel | Why | When | Content Type |
|---------|-----|------|-------------|
| **Omnivore community** | Users with active pain, actively searching | Day 1 | Direct: "I built an open-source replacement" in their GitHub/Reddit threads |
| **r/selfhosted** | Core audience. Highest-reliability channel. | Day 1 | Founder story, not product spec (see template below) |
| **Hacker News** | High variance but worth the ticket. | Day 1 (10am EST) | Story-driven title (see below) |
| **r/DataHoarder** | Better fit than r/ObsidianMD (save everything vs. take notes) | Day 2 | "Save and search everything you've ever emailed yourself" |
| **IndieHackers** | Builder community. Feedback + early adopters. | Week 1 | "I shipped my first open-source product" |
| **Twitter #buildinpublic** | Ongoing visibility | Day 1 + ongoing | Build-in-public thread |
| **lobste.rs** | Technical audience, less noisy than HN | Day 3 | Direct link post |

**REMOVED: Product Hunt.** Skip for now. PH requires upvote velocity, hunter relationships, and a pre-built email list. A cold PH launch is worse than no PH launch — it caps visibility permanently. Come back in 60 days with 20+ active users who'll upvote on launch day.

**REMOVED: r/ObsidianMD.** Wrong audience (note-taking vs. save-anything). Replaced with r/DataHoarder.

### Launch Titles (marketing-optimized)

**HN (story-driven, not product-spec):**
> "Show HN: I rebuilt Omnivore as an open-source self-hosted tool after it shut down"

**r/selfhosted (founder story, not product brochure):**
> "Omnivore shut down and took my reading list with it. I spent weekends building an open-source replacement. Here's drop-note."

Post structure:
1. **Lead with the story:** "When Omnivore got acquired and shut down, I lost my entire save-for-later workflow. So I built my own."
2. What it does: forward any email -> AI handles the rest
3. What it supports: platform table
4. Self-hosting: `docker compose up`
5. What's next: platform requests via GitHub issues
6. Links: GitHub, hosted version, demo video

### SEO Quick Win (marketing tip)

Write ONE blog post before or at launch:
> Title: "Open-Source Omnivore Alternative — Self-Hostable Read-Later with AI"

600 words, that exact phrase, GitHub link, demo screenshot. "Open source omnivore alternative" has search volume and low competition. Will rank within weeks. Don't build a content calendar. Do this one post.

### Success Metrics (revised after all reviews)

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Active users with 10+ items** | 3+ users (not Jason) within 30 days | Real retention signal (CEO: this replaces vanity star count) |
| GitHub stars | 30+ in first week | Social proof, but not the primary metric |
| Hosted signups | 20+ within 30 days | Demand validation |
| Docker self-host attempts | 5+ (check README traffic, clone count) | Self-hosters may be 3-5x hosted users |
| Signup-to-first-item gap | <24 hours for 50%+ of signups | Onboarding effectiveness |
| Community engagement | 3+ GitHub issues or PRs | Ecosystem health |

### Post-Launch Monitoring
- Check PostHog daily for first 2 weeks (signups, item_saved, referral sources, session replays)
- Respond to every GitHub issue within 24 hours
- Respond to every Reddit/HN comment within 2 hours on launch day
- **Block the ENTIRE launch Sunday for monitoring** (CEO: a successful launch means 4-6 hours of active comment management, not 2-3)

---

## Part 5: Weekend Execution Schedule

### Weekend 1 (April 12-13) — "Make It Shippable"

**Saturday Morning (3-4 hrs): Domain + repo hygiene**
- Research domain availability and buy (dropnote.co, dropnote.app, getdropnote.com)
- Add `.claude/`, internal files to `.gitignore`
- Replace `TODO-ORG` with real GitHub org
- Replace personal emails in docs
- Clean up `docs/next-plan.md` for public audience
- Fill in Privacy Policy data controller

**Saturday Afternoon (3-4 hrs): Code fixes**
- Add AI error handling (response.ok, timeout, retry classification)
- Verify Stripe SDK null-check safety (no crashes when env vars missing)
- Implement 50-item hard limit + warning banners (40/50 and 50/50)
- Disable Stripe upgrade buttons
- Add Supported Platforms page/section on site
- Add "Request a Platform" -> GitHub issue template link

**Sunday Morning (3-4 hrs): Onboarding + analytics**
- **Build new-user onboarding** (welcome modal, empty state, drop address display, "did your item arrive?" helper)
- Integrate PostHog (install, configure, instrument full event taxonomy)
- Take dashboard screenshots
- Add demo GIF or video (screen recording)

**Sunday Afternoon (2-3 hrs): Infrastructure + README**
- Configure DNS on Vercel
- Configure SendGrid MX records
- Set up drop email address
- Test end-to-end: email -> AI -> dashboard (all content types)
- Test email deliverability: Gmail, Outlook, ProtonMail (define pass/fail)
- Rewrite README (Omnivore lead, screenshot, platforms table, badges)
- Add GitHub issue templates (bug, feature, platform request)
- Enable GitHub Discussions

**Sunday Evening (1 hr): Community seeding**
- Find and comment in 3-5 Omnivore-related threads (Reddit, GitHub)
- Comment helpfully in r/selfhosted on related threads

**If anything slips:** Infrastructure tasks (DNS, SendGrid) often take 2-3x longer for first-timers. If Saturday runs over, push the README rewrite and launch post drafts to Weekend 2.

### Weekend 2 (April 19-20) — "Launch It"

**Saturday (4-5 hrs): Final testing + launch content**
- Full end-to-end test: every content type (email, YouTube, URL, PDF, image)
- Test with multiple email providers (Gmail, Outlook, ProtonMail, Yahoo)
- Verify Docker Compose works from a clean `git clone`
- Write all launch posts (r/selfhosted, HN, Omnivore threads, Twitter, IndieHackers)
- Write the SEO blog post ("Open-Source Omnivore Alternative")
- Set up Google Search Console
- Final review of all public-facing content
- **Verify hotfix deploy process works** (can you push a fix and deploy in <10 minutes?)

**Sunday: FULL DAY BLOCKED FOR LAUNCH**
- **Morning (before launch):** Final smoke test. Deep breath.
- **10am EST:** Make GitHub repo public
- **10:15am EST:** Submit to Hacker News (Show HN)
- **10:30am EST:** Post to r/selfhosted
- **11am EST:** Post in Omnivore community threads
- **11:30am EST:** Post Twitter thread
- **Rest of the day:** Monitor and respond to ALL comments, issues, and questions. This is a 6-8 hour commitment, not a 2-hour task. Have laptop open, notifications on, PostHog session replay ready.

### Post-Launch Week (April 21-25)
- Post to r/DataHoarder (Day 2)
- Post to lobste.rs (Day 3)
- Post to IndieHackers (Day 4-5)
- Publish SEO blog post
- Daily PostHog review
- Respond to all GitHub issues within 24 hours
- Ship quick bug fixes as needed

### Week 3+ (after launch settles)
- Review 30-day metrics
- Decide: invest more or let it run as portfolio piece
- If metrics are positive: start Phase 2 AI marketing agent
- Compile learnings for physio-os and snap-trade launches

---

## Part 6: Risks & Mitigations (revised)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Email deliverability fails** | **Critical** — the entire product is unusable | Medium | Test with 4+ email providers before launch. Add "did your item arrive?" helper. Have fallback instructions. Define pass criteria. |
| Domain name unavailable | High | Medium | Have 3 backup options ready. Check availability Saturday morning. |
| SendGrid MX record setup fails | High | Medium | Test with subdomain first. Have Cloudflare email routing as backup. Budget extra time. |
| Stripe crashes when env vars missing | High | Medium | Verify null checks before launch. Test with empty Stripe env vars. |
| New users churn from empty dashboard | High | High (without fix) | Build onboarding flow (welcome modal, empty state, quick-start guide). Non-negotiable. |
| HN launch gets no traction | Medium | High (cold launch) | Don't anchor to HN. r/selfhosted and Omnivore community are more reliable. |
| Users find bugs on launch day | Medium | High | Session replay ready. Hotfix deploy process verified. Block full day for monitoring. |
| Nobody uses the product | Medium | Medium | 30-day evaluation window. If no traction, it's still a portfolio piece. No regrets. |
| Weekend scope overflows | Medium | High | Infrastructure tasks take 2-3x for first-timers. Push non-critical items to post-launch. |
| AI costs spike | Low | Low | GPT-4o-mini at ~$0.15/1M input tokens. Even 1000 users x 50 items = ~$7.50 total. |

---

## Part 7: Resolved Decisions

1. **Domain:** Jason will buy tomorrow (April 11). TBD — check dropnote.co, dropnote.app, getdropnote.com availability.
2. **GitHub org:** `lego651` — repo is already at `github.com/lego651/drop-note`. Replace all `TODO-ORG` with `lego651`.
3. **Data controller:** Jason Gao (personal name, standard for open-source solo projects).
4. **AI provider:** Keep OpenAI GPT-4o-mini as default.
5. **Drop email address:** TBD — depends on domain purchased. Decide after domain is live.
6. **Docker registry:** GitHub Container Registry (`ghcr.io/lego651/drop-note`). Free for public repos, no rate limits, integrates with existing GitHub Actions CI. No Docker Hub account needed.

---

## Appendix: Reviewer Feedback Summary

### CEO Review
- **Scope:** Tight but executable IF you cut the automated AI agent from the 2-weekend scope. Infrastructure (DNS, SendGrid) routinely takes 2-3x longer for first-timers. Add buffer.
- **Channel:** Skip Product Hunt. It requires hunter relationships and pre-built audience. A half-baked PH launch is worse than none.
- **Metrics:** Replace "50 stars" with "3+ users (not you) who save 10+ items in 30 days." That's retention. That's what matters.
- **Launch day:** Block the entire Sunday. A successful HN/Reddit launch = 4-6 hours of active comment management. Going dark for 2 hours kills momentum.
- **AI agent:** Phase 1 (manual) is fine. Phase 2 (automated) not until 30 days of real data. Don't optimize noise.

### PM Review
- **Free limit:** Raise from 20 to 50 items. 20 is too stingy — users hit the ceiling before forming the habit. AI costs are negligible either way.
- **URL support:** Be honest. If the AI only sees the URL string (not page content), don't claim "AI summary." Call it "Basic" support.
- **Onboarding is critical:** Empty dashboard with no instructions = highest-churn moment. Build welcome modal + empty state + "did your item arrive?" helper. Non-negotiable.
- **Stripe safety:** Verify SDK init is gated behind null checks. Missing env vars will crash server-side, not just hide buttons.
- **Analytics gaps:** Add `item_opened`, `session_returned`, `email_forwarding_first`, `self_host_docs_viewed` to the event taxonomy.
- **r/ObsidianMD is wrong audience.** Replace with r/DataHoarder.
- **Launch day risk:** Email deliverability. If Gmail silently drops forwarded emails, the first impression is a black hole.

### Marketing Manager Review
- **Positioning:** Lead with Omnivore, not a generic tagline. "Omnivore shut down. drop-note is the open-source alternative."
- **HN title:** Story-driven, not product-spec. "Show HN: I rebuilt Omnivore as an open-source self-hosted tool after it shut down."
- **r/selfhosted post:** Founder story, not product brochure. Start with why, not what.
- **Community seeding:** The #1 launch risk is zero existing audience. Fix: spend 1-2 hours during Weekend 1 participating in Omnivore threads and r/selfhosted. Plant flags before the launch post lands.
- **SEO quick win:** Write ONE blog post titled "Open-Source Omnivore Alternative." 600 words, will rank within weeks.
- **Skip Product Hunt and r/ObsidianMD.** Add Omnivore community and r/DataHoarder.
- **AI agent is a distraction for now.** PostHog referral tracking does 90% of what you need for 30 days.

---

*Plan created April 10, 2026. Reviewed by CEO, Product Manager, and Marketing Manager.*
*Ready for Jason's answers on Part 7 questions before breaking into implementation tickets.*
