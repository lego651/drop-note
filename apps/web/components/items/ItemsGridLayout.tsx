import { ItemCard } from '@/components/ItemCard'
import type { ItemSummary } from '@/lib/items'

interface ItemsGridLayoutProps {
  items: ItemSummary[]
  isBulkMode?: boolean
  selectedIds?: Set<string>
  onSelectChange?: (id: string, checked: boolean) => void
  onPinChange?: (id: string, pinned: boolean) => void
  onDelete?: (id: string) => void
}

export function ItemsGridLayout({
  items,
  isBulkMode = false,
  selectedIds,
  onSelectChange,
  onPinChange,
  onDelete,
}: ItemsGridLayoutProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          isBulkMode={isBulkMode}
          isSelected={selectedIds?.has(item.id) ?? false}
          onSelectChange={onSelectChange}
          onPinChange={onPinChange}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
