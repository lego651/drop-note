import { ItemCard } from '@/components/ItemCard'
import type { ItemSummary } from '@/lib/items'

interface ItemsGridLayoutProps {
  items: ItemSummary[]
}

export function ItemsGridLayout({ items }: ItemsGridLayoutProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </div>
  )
}
