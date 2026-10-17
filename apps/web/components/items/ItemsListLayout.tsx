import { ListCard } from '@/components/items/ListCard'
import type { BadgeCategory } from '@/components/categories/CategoryBadge'
import type { ItemSummary } from '@/lib/items'
import type { CategoryLite } from '@/lib/category-display'

interface ItemsListLayoutProps {
  items: ItemSummary[]
  isBulkMode?: boolean
  selectedIds?: Set<string>
  categories?: CategoryLite[]
  onSelectChange?: (id: string, checked: boolean) => void
  onPinChange?: (id: string, pinned: boolean) => void
  onDelete?: (id: string) => void
  onCategoryMoved?: (itemId: string, category: BadgeCategory, locked: boolean) => void
}

export function ItemsListLayout({
  items,
  isBulkMode = false,
  selectedIds,
  categories,
  onSelectChange,
  onPinChange,
  onDelete,
  onCategoryMoved,
}: ItemsListLayoutProps) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <ListCard
          key={item.id}
          item={item}
          isBulkMode={isBulkMode}
          isSelected={selectedIds?.has(item.id) ?? false}
          categories={categories}
          onSelectChange={onSelectChange}
          onPinChange={onPinChange}
          onDelete={onDelete}
          onCategoryMoved={onCategoryMoved}
        />
      ))}
    </div>
  )
}
