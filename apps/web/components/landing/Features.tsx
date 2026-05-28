import { PenLine, Tag, Search, Calendar, Upload, CreditCard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const serifItalic: React.CSSProperties = {
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
  fontStyle: 'italic',
}

interface Feature {
  icon: LucideIcon
  title: string
  body: string
}

const FEATURES: Feature[] = [
  {
    icon: PenLine,
    title: 'AI summaries',
    body: 'Every item gets a crisp 2-sentence summary written by GPT-4o-mini so you know what you saved without re-reading.',
  },
  {
    icon: Tag,
    title: 'Auto-tagging',
    body: 'Topics, domains, and content types are detected automatically. Tags appear instantly — no manual categorization.',
  },
  {
    icon: Search,
    title: 'Full-text search',
    body: 'Search across titles, summaries, and original content. Find that article from 6 months ago in under a second.',
  },
  {
    icon: Calendar,
    title: 'Browse by date',
    body: 'Collapsible year/month accordion in the sidebar. Your reading history organized exactly how you\'d expect.',
  },
  {
    icon: Upload,
    title: 'Any content type',
    body: 'Articles, YouTube links, PDFs, raw URLs, or plain-text notes. If you can email it, drop-note can save it.',
  },
  {
    icon: CreditCard,
    title: 'Self-host option',
    body: 'Full source on GitHub. Run it on your own infrastructure, keep your data on your servers, no vendor lock-in.',
  },
]

export function Features() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20">
      {/* Pill */}
      <span className="inline-flex rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground tracking-widest mb-6">
        FEATURES
      </span>

      {/* Headline */}
      <h2 className="text-3xl font-bold tracking-tight leading-tight sm:text-4xl mb-4">
        Everything your <span style={serifItalic}>read-later app</span> should have been.
      </h2>

      {/* Subhead */}
      <p className="text-muted-foreground max-w-2xl mb-12 leading-relaxed">
        No setup. No browser extension. No import/export friction. Just your email and a dashboard
        that stays organized automatically.
      </p>

      {/* Feature cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((feature) => {
          const Icon = feature.icon
          return (
            <div key={feature.title} className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 inline-flex rounded-lg bg-muted p-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.body}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
