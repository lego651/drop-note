'use client'

import { LayoutGrid, LayoutList, Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ViewMode = 'list' | 'card' | 'timeline'

// v2: bumped so stale 'list' preferences are discarded and everyone gets the
// new Gallery default (the redesign changed the default view to card/gallery).
export const VIEW_STORAGE_KEY = 'drop-note:items-view-v2'

interface ViewSwitcherProps {
  activeView: ViewMode
  onViewChange: (view: ViewMode) => void
}

// Order matches the design: Gallery (grid) → List → Compact
const VIEWS: { value: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { value: 'card', label: 'Gallery view', Icon: LayoutGrid },
  { value: 'list', label: 'List view', Icon: LayoutList },
  { value: 'timeline', label: 'Compact view', Icon: Rows3 },
]

export function ViewSwitcher({ activeView, onViewChange }: ViewSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-background p-1"
    >
      {VIEWS.map(({ value, label, Icon }) => {
        const active = activeView === value
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={() => onViewChange(value)}
            className={cn(
              'flex h-7 w-9 items-center justify-center rounded-md transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon size={15} />
          </button>
        )
      })}
    </div>
  )
}
