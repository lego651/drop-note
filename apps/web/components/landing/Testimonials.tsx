const serifItalic: React.CSSProperties = {
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
  fontStyle: 'italic',
}

interface Testimonial {
  initials: string
  name: string
  role: string
  quote: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    initials: 'JR',
    name: 'Jordan Reeves',
    role: 'Staff Engineer, Stripe',
    quote:
      "I've tried Instapaper, Pocket, Readwise — nothing stuck. With drop-note I just forward the email and forget it. The AI tags are surprisingly accurate.",
  },
  {
    initials: 'PN',
    name: 'Priya Nair',
    role: 'Independent Developer, Bangalore',
    quote:
      'The self-host option sold me. I have everything running on my own VPS, full control over my data, and it took less than 20 minutes to set up.',
  },
  {
    initials: 'MC',
    name: 'Marcus Calloway',
    role: 'UX Researcher, Figma',
    quote:
      'My research workflow is completely different now. I email papers and YouTube talks all day, and by the time I sit down to review them they\'re already summarized.',
  },
]

export function Testimonials() {
  return (
    <section className="bg-muted/40 border-y border-border py-20">
      <div className="mx-auto max-w-5xl px-4">
        {/* Pill */}
        <div className="flex justify-center mb-6">
          <span className="inline-flex rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground tracking-widest">
            FROM USERS
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl mb-14">
          Built for people who <span style={serifItalic}>actually save things.</span>
        </h2>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="rounded-xl border border-border bg-background p-6 flex flex-col justify-between">
              <p className="text-sm text-muted-foreground leading-relaxed mb-6" style={serifItalic}>
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background text-sm font-bold flex-shrink-0">
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
