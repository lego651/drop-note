import { ItemCard } from '@/components/ItemCard'
import { groupItemsByDate } from '@/lib/items'
import type { ItemSummary } from '@/lib/items'

interface TimelineSpineProps {
  items: ItemSummary[]
  isBulkMode?: boolean
  selectedIds?: Set<string>
  onSelectChange?: (id: string, checked: boolean) => void
  onPinChange?: (id: string, pinned: boolean) => void
  onDelete?: (id: string) => void
}

export function TimelineSpine({
  items,
  isBulkMode = false,
  selectedIds,
  onSelectChange,
  onPinChange,
  onDelete,
}: TimelineSpineProps) {
  const groups = groupItemsByDate(items)

  if (groups.length === 0) return null

  return (
    <div className="relative">
      {/* Vertical spine line */}
      <div
        className="absolute left-[7px] top-2 bottom-2 w-px bg-border"
        aria-hidden="true"
      />

      <div className="space-y-6">
        {groups.map((group) => {
          const dateStr = group.date.toISOString().slice(0, 10)
          return (
            <div key={dateStr} className="relative pl-6">
              {/* Spine dot */}
              <div
                className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-border bg-background"
                aria-hidden="true"
              />

              {/* Date label */}
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <time dateTime={dateStr}>{group.label}</time>
              </h3>

              {/* Items for this date */}
              <div className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    isBulkMode={isBulkMode}
                    isListView
                    isSelected={selectedIds?.has(item.id) ?? false}
                    onSelectChange={onSelectChange}
                    onPinChange={onPinChange}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
