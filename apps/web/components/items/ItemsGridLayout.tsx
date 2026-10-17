import { GalleryCard } from '@/components/items/GalleryCard'
import type { BadgeCategory } from '@/components/categories/CategoryBadge'
import type { ItemSummary } from '@/lib/items'
import type { CategoryLite } from '@/lib/category-display'

interface ItemsGridLayoutProps {
  items: ItemSummary[]
  isBulkMode?: boolean
  selectedIds?: Set<string>
  categories?: CategoryLite[]
  onSelectChange?: (id: string, checked: boolean) => void
  onPinChange?: (id: string, pinned: boolean) => void
  onDelete?: (id: string) => void
  onCategoryMoved?: (itemId: string, category: BadgeCategory, locked: boolean) => void
}

export function ItemsGridLayout({
  items,
  isBulkMode = false,
  selectedIds,
  categories,
  onSelectChange,
  onPinChange,
  onDelete,
  onCategoryMoved,
}: ItemsGridLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <GalleryCard
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
