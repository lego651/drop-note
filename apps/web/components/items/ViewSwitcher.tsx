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
      className="inline-flex items-center gap-0.5 rounded-[10px] border-stroke border-ink bg-card p-[3px] shadow-ink-md"
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
              'flex h-11 w-11 items-center justify-center rounded-md transition-colors sm:h-[30px] sm:w-9',
              active
                ? 'bg-primary text-primary-foreground'
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
