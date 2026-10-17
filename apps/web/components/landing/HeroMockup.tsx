// Static browser window mockup — no interactivity needed

import { colorForTagHsl } from '@/lib/design-tokens'

const SAMPLE_ITEMS = [
  {
    title: 'The Illustrated Guide to a Ph.D.',
    summary:
      'A visual metaphor explaining what a Ph.D. is, how research expands the boundary of knowledge, and why that tiny dent matters.',
    tags: ['research', 'academia'],
  },
  {
    title: 'Why Figma is eating the design world',
    summary:
      "Analysis of how Figma's collaborative-first approach disrupted Adobe and reshaped how design teams ship products.",
    tags: ['design', 'saas'],
  },
]

const SIDEBAR_TAGS = [
  { name: 'research', count: 1 },
  { name: 'design', count: 1 },
  { name: 'dev', count: 3 },
  { name: 'reading', count: 1 },
]

export function HeroMockup() {
  return (
    <div
      className="stripe-top mx-auto mt-12 max-w-3xl rounded-xl border-stroke border-ink bg-card shadow-ink-lg overflow-hidden"
      style={{ '--stripe-h': '5px' } as React.CSSProperties}
      aria-hidden="true"
    >
      {/* Title bar */}
      <div className="flex items-center gap-4 px-4 py-3 bg-muted/50 border-b border-border">
        {/* Fake address bar */}
        <div className="flex-1 rounded-md bg-background/80 border border-border px-3 py-1 text-center text-xs text-muted-foreground font-mono">
          dropnote.me/items
        </div>
      </div>

      {/* App layout */}
      <div className="flex" style={{ minHeight: 280 }}>
        {/* Sidebar */}
        <div className="w-44 border-r-stroke border-ink bg-background p-3 flex-shrink-0">
          <div className="text-xs font-bold text-foreground mb-3">drop-note</div>
          <nav className="space-y-0.5 mb-4">
            {['All Items', 'Settings', 'Trash'].map((item) => (
              <div
                key={item}
                className={`text-xs px-2 py-1 rounded text-muted-foreground hover:text-foreground ${item === 'All Items' ? 'bg-accent text-foreground font-medium' : ''}`}
              >
                {item}
              </div>
            ))}
          </nav>
          <div className="type-label mb-1 px-2 text-muted-foreground">TAGS</div>
          {SIDEBAR_TAGS.map((tag) => (
            <div key={tag.name} className="flex items-center justify-between px-2 py-0.5">
              <span className="text-xs text-muted-foreground">{tag.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{tag.count}</span>
            </div>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 bg-canvas p-3 space-y-2 overflow-hidden">
          {SAMPLE_ITEMS.map((item) => (
            <div key={item.title} className="rounded-lg border-stroke border-ink bg-card shadow-ink-sm p-3">
              <div className="text-xs font-semibold text-foreground mb-1 truncate">
                {item.title}
              </div>
              <div className="text-[11px] text-muted-foreground mb-2 line-clamp-2 leading-relaxed">
                {item.summary}
              </div>
              <div className="flex gap-1 mb-2">
                {item.tags.map((tag) => {
                  const hsl = colorForTagHsl(tag)
                  return (
                    <span
                      key={tag}
                      className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: `hsl(${hsl} / 0.08)`,
                        borderColor: `hsl(${hsl} / 0.45)`,
                        color: `hsl(${hsl})`,
                      }}
                    >
                      #{tag}
                    </span>
                  )
                })}
              </div>
              <div className="flex items-center justify-between border-t-stroke border-dashed border-ink/35 pt-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                  Oct 16
                </span>
                <span className="stripe-mini" aria-hidden="true" />
              </div>
            </div>
          ))}

          {/* Skeleton / processing card */}
          <div className="rounded-lg border-stroke border-ink bg-card shadow-ink-sm p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="h-2.5 w-32 rounded bg-muted animate-pulse" />
              <span className="text-[10px] text-muted-foreground">Processing...</span>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 w-full rounded bg-muted animate-pulse" />
              <div className="h-2 w-4/5 rounded bg-muted animate-pulse" />
              <div className="h-2 w-3/5 rounded bg-muted animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
