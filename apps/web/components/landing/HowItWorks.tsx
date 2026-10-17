import { Mail, Clock, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Step {
  number: string
  icon: LucideIcon
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    number: '01',
    icon: Mail,
    title: 'Email it',
    body: 'From your phone, laptop, or any device — forward articles, paste links, attach PDFs, or just write a quick note.',
  },
  {
    number: '02',
    icon: Clock,
    title: 'AI processes it',
    body: 'GPT-4o-mini reads the content, writes a 2-sentence summary, and assigns relevant tags — all within seconds.',
  },
  {
    number: '03',
    icon: Search,
    title: 'Find it later',
    body: 'Search by keyword, filter by tag, or browse by date. Everything you\'ve ever saved, instantly retrievable.',
  },
]

export function HowItWorks() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        {/* Eyebrow */}
        <div className="flex justify-center mb-6">
          <span className="type-label inline-flex rounded-full border-stroke border-dashed border-ink px-3 py-1 text-muted-foreground">
            HOW IT WORKS
          </span>
        </div>

        {/* Headline */}
        <h2 className="type-display text-center text-[28px] sm:text-[36px] mb-14">
          Three steps. Zero friction.
        </h2>

        {/* Steps grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map((step) => {
            const Icon = step.icon
            return (
              <div
                key={step.number}
                className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border-stroke border-ink bg-primary font-mono text-xs font-bold text-primary-foreground flex-shrink-0">
                    {step.number}
                  </span>
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full border-stroke border-dashed bg-card flex-shrink-0"
                    style={{ borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <h3 className="font-semibold text-foreground text-lg mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
