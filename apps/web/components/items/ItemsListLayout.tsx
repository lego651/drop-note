import { ItemCard } from '@/components/ItemCard'
import type { ItemSummary } from '@/lib/items'

interface ItemsListLayoutProps {
  items: ItemSummary[]
}

export function ItemsListLayout({ items }: ItemsListLayoutProps) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </div>
  )
}
