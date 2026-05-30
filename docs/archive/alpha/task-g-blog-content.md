# The Best Open-Source Omnivore Alternative in 2026

**Published:** 2026-05-28

---

Omnivore got acquired by ElevenLabs in late 2024 and shut down. If you used it to save articles, newsletters, and research, you lost your read-later library. A lot of people are still looking for a replacement.

drop-note is that replacement.

---

## What happened to Omnivore

Omnivore was open-source, self-hostable, and free. It let you save anything by email or browser extension, read it later, and organize it with labels and highlights. It was genuinely good.

Then ElevenLabs acquired it in November 2024. The hosted service shut down. The repo went into maintenance mode. The community scattered.

The void is real. Readwise Reader is the polished commercial option at $7.99/month, but it is a closed SaaS. Raindrop is $3/month, focused on bookmarks not reading. Pocket was acquired by Mozilla and feels abandoned. None of them fill the "open-source, self-hostable, email-first" slot that Omnivore occupied.

---

## What drop-note is

drop-note is an email-to-dashboard content saver. You save things by emailing them.

The workflow:
1. Email anything to `drop@dropnote.me` from your registered address
2. AI summarizes it and applies tags automatically
3. It appears in your dashboard — searchable, filterable, organized

That is the whole product. Email in, organized dashboard out.

What you can email:
- A URL (YouTube, article, tweet thread, GitHub issue)
- A PDF attachment
- A newsletter you forwarded
- A note you wrote to yourself
- An email thread you want to archive

The AI uses GPT-4o-mini to generate a one-paragraph summary and suggest tags. You can edit both. The dashboard gives you list view, card view, and timeline view, with full-text search across everything.

---

## Why email-first

Omnivore had a browser extension and a mobile app. drop-note has neither, intentionally.

Every read-later tool ends up the same: you save 400 things and read 12 of them. The bottleneck is not the ingestion interface, it is the triage.

Email is already the universal inbox. You already forward things you want to remember. drop-note meets you there instead of asking you to install another extension or change your behavior.

The friction of typing an email address is also useful. You only save things that are actually worth a second look, not everything you hover over while scrolling.

---

## Self-hosted or hosted

drop-note is AGPL-3.0 licensed. That matters for two reasons.

First, you can self-host the full stack on your own infrastructure with `docker compose up`. No license key, no phone-home telemetry, no usage caps. Your data stays where you put it.

Second, AGPL means anyone who modifies drop-note and offers it as a service has to publish their source. The license protects the open-source nature of the project.

The hosted version at `dropnote.me` is free. The self-hosted version is free. There is no paid tier right now.

---

## How to self-host

Requirements:
- Docker and Docker Compose
- A Supabase project (free tier works)
- An OpenAI API key (or configure a compatible provider)
- A domain with MX records pointing to SendGrid Inbound Parse

```bash
git clone https://github.com/lego651/drop-note
cd drop-note
cp .env.example .env
# fill in your Supabase URL, anon key, service role key, OpenAI key
docker compose up
```

Full self-hosting documentation is in the README.

---

## Comparison

| Feature | drop-note | Omnivore (defunct) | Readwise Reader |
|---|---|---|---|
| Open source | Yes (AGPL) | Yes (Apache 2) | No |
| Self-hostable | Yes | Yes | No |
| Email ingestion | Yes | Yes | No |
| Browser extension | No | Yes | Yes |
| Mobile app | No | Yes | Yes |
| AI summary | Yes | No | Yes |
| Price (hosted) | Free | Was free | $7.99/mo |

The gap we fill: open-source, self-hostable, email-first, AI-organized. That is a different product than Readwise (closed, browser-first, annotation-focused) and a better-maintained project than the Omnivore fork ecosystem.

---

## Get started

The hosted version is free. No credit card, no invite code required — just sign in with Google.

Try the hosted version: [dropnote.me/login](https://dropnote.me/login)

Self-host it: [github.com/lego651/drop-note](https://github.com/lego651/drop-note)

---

*drop-note is built by Jason Gao and released under AGPL-3.0.*
