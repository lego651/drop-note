import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Roadmap — drop-note',
  description:
    "What we've shipped, what's next, and what's deferred for drop-note.",
}

const SHIPPED = [
  {
    label: 'Email → AI pipeline (summarize + auto-tag)',
    detail: 'Send anything to drop@dropnote.me',
  },
  {
    label: 'YouTube URL detection + thumbnail preview',
    detail: 'Paste a YouTube link, get the transcript summarized',
  },
  {
    label: 'PDF extraction + image description',
    detail: 'Attach a PDF, get AI-extracted text + summary',
  },
  {
    label: 'Dashboard: list, card, and timeline views',
    detail: 'Three ways to browse your saved items',
  },
  { label: 'Full-text search + tag filtering', detail: 'Find anything instantly' },
  {
    label: 'Bulk operations (tag, delete, restore)',
    detail: 'Manage multiple items at once',
  },
  { label: 'Google OAuth login', detail: 'One-click sign-in, no passwords' },
  { label: 'Pin + delete + restore', detail: 'Organize and manage items' },
  {
    label: 'Weekly digest email',
    detail: "Monday morning summary of last week's saves",
  },
  {
    label: 'Onboarding modal + empty state',
    detail: 'New user experience on first visit',
  },
  {
    label: 'Rate limiting + abuse protection',
    detail: 'Per-user and per-IP limits via Upstash Redis',
  },
  {
    label: 'Admin panel',
    detail: 'User management, blocklist, invite codes, stats',
  },
  {
    label: 'Docker self-host stack',
    detail: "docker compose up and you're running",
  },
  { label: 'AGPL-3.0 open source', detail: 'Full source on GitHub' },
  { label: 'Sentry error monitoring', detail: 'Production error tracking' },
  {
    label: 'Legal pages (Terms, Privacy, AUP)',
    detail: 'GDPR-aware, Jason Gao as data controller',
  },
  {
    label: 'SEO blog: Save Anything From Anywhere',
    detail: 'Universal capture positioning — email as the interface',
  },
  {
    label: 'Public landing page + free pricing',
    detail: 'No paid tiers at launch',
  },
  {
    label: 'OG meta tags + social share cards',
    detail: 'Looks good when shared on HN, Twitter, Slack',
  },
]

const COMING_NEXT = [
  {
    label: 'Mobile-responsive polish',
    detail: 'Dashboard works on phone, just needs love',
  },
  {
    label: 'Per-user email routing (v2)',
    detail: 'drop+[token]@dropnote.me — already in schema, shipping at scale',
  },
  {
    label: 'Hosted tier ($4.99/mo)',
    detail: 'Only when 100 active hosted users — Plausible model',
  },
  {
    label: 'Async AI queue (QStash)',
    detail: 'Switch from sync to async when p95 latency climbs',
  },
]

const DEFERRED = [
  {
    label: 'Browser extension',
    detail: 'Email-first IS the wedge. Extension is complexity for marginal gain.',
  },
  {
    label: 'Mobile app',
    detail: "Use your phone's native share sheet → email. No app needed.",
  },
  {
    label: 'Readwise-competitive features',
    detail: "Head-to-head is unwinnable. Self-host is our moat.",
  },
  {
    label: 'Product Hunt launch',
    detail: 'Deferred 60 days post-launch. HN and r/selfhosted first.',
  },
]

export default function RoadmapPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-8">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to drop-note
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight mb-2">Roadmap</h1>
      <p className="text-muted-foreground mb-12">
        drop-note is open source (AGPL-3.0). This is what we&apos;ve built, what&apos;s
        coming, and what we&apos;ve intentionally left out.
      </p>

      {/* SHIPPED */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4">Shipped</h2>
        <div className="space-y-2">
          {SHIPPED.map(({ label, detail }) => (
            <div
              key={label}
              className="flex items-start gap-3 py-2 border-b border-border last:border-0"
            >
              <span className="text-green-600 font-bold mt-0.5 shrink-0">✓</span>
              <div>
                <div className="text-sm font-medium text-foreground">{label}</div>
                <div className="text-xs text-muted-foreground">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* COMING NEXT */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4">Coming next</h2>
        <div className="space-y-2">
          {COMING_NEXT.map(({ label, detail }) => (
            <div
              key={label}
              className="flex items-start gap-3 py-2 border-b border-border last:border-0"
            >
              <span className="text-blue-500 font-bold mt-0.5 shrink-0">→</span>
              <div>
                <div className="text-sm font-medium text-foreground">{label}</div>
                <div className="text-xs text-muted-foreground">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* DEFERRED */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4">Intentionally deferred</h2>
        <div className="space-y-2">
          {DEFERRED.map(({ label, detail }) => (
            <div
              key={label}
              className="flex items-start gap-3 py-2 border-b border-border last:border-0"
            >
              <span className="text-muted-foreground font-bold mt-0.5 shrink-0">—</span>
              <div>
                <div className="text-sm font-medium text-foreground">{label}</div>
                <div className="text-xs text-muted-foreground">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <div className="border border-border rounded-lg p-6 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          drop-note is AGPL-3.0. Read the code, run your own instance, or use the free
          hosted version.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="https://github.com/lego651/drop-note"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground transition-colors"
          >
            View on GitHub
          </a>
          <Link
            href="/login"
            className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground transition-colors"
          >
            Get started free
          </Link>
        </div>
      </div>
    </div>
  )
}
