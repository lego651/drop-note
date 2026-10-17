interface Testimonial {
  initials: string
  name: string
  role: string
  quote: string
  avatarColor: string
  avatarBg: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    initials: 'JR',
    name: 'Jordan Reeves',
    role: 'Staff Engineer, Stripe',
    quote:
      "I've tried Instapaper, Pocket, Readwise — nothing stuck. With drop-note I just forward the email and forget it. The AI tags are surprisingly accurate.",
    avatarColor: 'hsl(var(--color-pin))',
    avatarBg: 'hsl(var(--color-pin) / 0.12)',
  },
  {
    initials: 'PN',
    name: 'Priya Nair',
    role: 'Independent Developer, Bangalore',
    quote:
      'drop-note replaced three different tools I was using. Now I just email everything to one address and the AI does the rest. It actually works.',
    avatarColor: 'hsl(var(--color-tag-teal))',
    avatarBg: 'hsl(var(--color-tag-teal) / 0.12)',
  },
  {
    initials: 'MC',
    name: 'Marcus Calloway',
    role: 'UX Researcher, Figma',
    quote:
      'My research workflow is completely different now. I email papers and YouTube talks all day, and by the time I sit down to review them they\'re already summarized.',
    avatarColor: 'hsl(var(--color-tag-indigo))',
    avatarBg: 'hsl(var(--color-tag-indigo) / 0.12)',
  },
]

export function Testimonials() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        {/* Eyebrow */}
        <div className="flex justify-center mb-6">
          <span className="type-label inline-flex rounded-full border-stroke border-dashed border-ink px-3 py-1 text-muted-foreground">
            FROM USERS
          </span>
        </div>

        {/* Headline */}
        <h2 className="type-display text-center text-[28px] sm:text-[36px] mb-14">
          Built for people who actually save things.
        </h2>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-6 flex flex-col justify-between">
              <p className="text-sm text-foreground leading-relaxed mb-6">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: t.avatarBg, color: t.avatarColor }}
                >
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
