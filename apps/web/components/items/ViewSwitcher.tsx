'use client'

import { LayoutList, LayoutGrid, AlignLeft } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export type ViewMode = 'list' | 'card' | 'timeline'

export const VIEW_STORAGE_KEY = 'drop-note:items-view'

interface ViewSwitcherProps {
  activeView: ViewMode
  onViewChange: (view: ViewMode) => void
}

export function ViewSwitcher({ activeView, onViewChange }: ViewSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={activeView}
      onValueChange={(value) => {
        if (value) onViewChange(value as ViewMode)
      }}
      aria-label="View mode"
    >
      <ToggleGroupItem value="list" aria-label="List view" size="sm">
        <LayoutList size={15} />
      </ToggleGroupItem>
      <ToggleGroupItem value="card" aria-label="Card (grid) view" size="sm">
        <LayoutGrid size={15} />
      </ToggleGroupItem>
      <ToggleGroupItem value="timeline" aria-label="Timeline view" size="sm">
        <AlignLeft size={15} />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
