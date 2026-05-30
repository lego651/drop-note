import { Mail, Clock, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const serifItalic: React.CSSProperties = {
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
  fontStyle: 'italic',
}

interface Step {
  number: string
  icon: LucideIcon
  title: string
  body: string
  iconColor: string
  iconBg: string
}

const STEPS: Step[] = [
  {
    number: '01',
    icon: Mail,
    title: 'Email it',
    body: 'From your phone, laptop, or any device — forward articles, paste links, attach PDFs, or just write a quick note.',
    iconColor: 'hsl(var(--color-pin))',
    iconBg: 'hsl(var(--color-pin) / 0.1)',
  },
  {
    number: '02',
    icon: Clock,
    title: 'AI processes it',
    body: 'GPT-4o-mini reads the content, writes a 2-sentence summary, and assigns relevant tags — all within seconds.',
    iconColor: 'hsl(var(--color-tag-purple))',
    iconBg: 'hsl(var(--color-tag-purple) / 0.1)',
  },
  {
    number: '03',
    icon: Search,
    title: 'Find it later',
    body: 'Search by keyword, filter by tag, or browse by date. Everything you\'ve ever saved, instantly retrievable.',
    iconColor: 'hsl(var(--color-tag-teal))',
    iconBg: 'hsl(var(--color-tag-teal) / 0.1)',
  },
]

export function HowItWorks() {
  return (
    <section className="bg-muted/40 border-y border-border py-20">
      <div className="mx-auto max-w-5xl px-4">
        {/* Pill */}
        <div className="flex justify-center mb-6">
          <span className="inline-flex rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground tracking-widest">
            HOW IT WORKS
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-center text-4xl font-bold tracking-tight mb-14">
          Three steps. <span style={serifItalic}>Zero friction.</span>
        </h2>

        {/* Steps grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map((step) => {
            const Icon = step.icon
            return (
              <div
                key={step.number}
                className="rounded-xl border border-border bg-background p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background text-sm font-bold flex-shrink-0">
                    {step.number}
                  </span>
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0"
                    style={{ backgroundColor: step.iconBg }}
                  >
                    <Icon className="h-4 w-4" style={{ color: step.iconColor }} />
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
