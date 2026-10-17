import { Skeleton } from '@/components/ui/skeleton'
import { ItemCategoryControl } from '@/components/categories/ItemCategoryControl'
import type { BadgeCategory } from '@/components/categories/CategoryBadge'
import type { CategoryLite } from '@/lib/category-display'

interface ItemCategorySectionProps {
  itemId: string
  category: BadgeCategory | null
  locked: boolean
  /** True while the item's AI pipeline is still running (status pending/processing). */
  isProcessing: boolean
  categories: CategoryLite[]
}

/**
 * The item detail "Category" panel (spec §3): a type-label heading, the lg
 * badge/picker, and a lock/AI hint. Hidden entirely when there's no category
 * and the item isn't processing (e.g. a failed item from before categories
 * existed) — same "don't invent an Other badge" rule the cards follow.
 */
export function ItemCategorySection({
  itemId,
  category,
  locked,
  isProcessing,
  categories,
}: ItemCategorySectionProps) {
  if (!category && !isProcessing) return null

  return (
    <div className="mb-6 space-y-1.5">
      <p className="type-label text-foreground">Category</p>
      {category ? (
        <ItemCategoryControl
          itemId={itemId}
          category={category}
          locked={locked}
          categories={categories}
          size="lg"
          showLockHint
        />
      ) : (
        <Skeleton className="h-[34px] w-32 rounded-full" />
      )}
    </div>
  )
}
