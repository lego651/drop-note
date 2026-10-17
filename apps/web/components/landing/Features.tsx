import { PenLine, Tag, Search, Calendar, Upload, CreditCard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
    title: 'Privacy first',
    body: 'Your content is never sold or shared. Items are processed by OpenAI for summarisation only — nothing else touches your data.',
  },
]

export function Features() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20">
      {/* Eyebrow */}
      <span className="type-label inline-flex rounded-full border-stroke border-dashed border-ink px-3 py-1 text-muted-foreground mb-6">
        FEATURES
      </span>

      {/* Headline */}
      <h2 className="type-display text-[28px] leading-tight sm:text-[36px] mb-4">
        Everything your read-later app should have been.
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
            <div key={feature.title} className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-6">
              <div
                className="mb-4 flex h-9 w-9 items-center justify-center rounded-full border-stroke border-dashed bg-card"
                style={{ borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' }}
              >
                <Icon className="h-4 w-4" />
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
