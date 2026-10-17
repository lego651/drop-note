'use client'

import { Check } from 'lucide-react'
import {
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { CategoryGlyph } from '@/components/categories/CategoryGlyph'
import { sortCategoriesForDisplay, type CategoryLite } from '@/lib/category-display'

interface CategoryPickerContentProps {
  /** All of the user's categories, including hidden ones. */
  categories: CategoryLite[]
  /** The item's current category id (single-item mode). Omit/null for bulk mode. */
  currentCategoryId?: string | null
  onSelect: (category: CategoryLite) => void
  label: string
  footer: string
  align?: 'start' | 'end'
  side?: 'right' | 'bottom' | 'left' | 'top'
  className?: string
  /**
   * Cards wrap the trigger badge in a <Link>; React bubbles portal content
   * clicks up through the component tree to that Link, so pickers used
   * inside a card must stop the click here to avoid navigating away.
   */
  onContentClick?: (e: React.MouseEvent) => void
}

/**
 * The shared "MOVE TO" radio list used by cards, item detail and bulk move.
 * Callers own the DropdownMenu root/trigger and the actual move request —
 * this only renders the list and reports a pick via onSelect.
 */
export function CategoryPickerContent({
  categories,
  currentCategoryId = null,
  onSelect,
  label,
  footer,
  align = 'start',
  side = 'right',
  className,
  onContentClick,
}: CategoryPickerContentProps) {
  const visible = sortCategoriesForDisplay(categories.filter((c) => !c.hidden))
  const current = categories.find((c) => c.id === currentCategoryId)
  // A hidden current category is still shown, pinned to the top, so the user can see
  // (and keep) where the item already lives even though it no longer appears in pickers.
  const rows = current?.hidden ? [current, ...visible] : visible

  return (
    <DropdownMenuContent
      align={align}
      side={side}
      onClick={onContentClick}
      className={className ?? 'w-64 max-h-[min(26rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto'}
    >
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={currentCategoryId ?? ''}
        onValueChange={(id) => {
          if (id === currentCategoryId) return
          const picked = categories.find((c) => c.id === id)
          if (picked) onSelect(picked)
        }}
      >
        {rows.map((c) => (
          <DropdownMenuRadioItem key={c.id} value={c.id}>
            <CategoryGlyph category={c} />
            <span className="flex-1 truncate" title={c.name}>
              {c.name}
            </span>
            {c.hidden && <span className="text-muted-foreground">(hidden)</span>}
            <DropdownMenuItemIndicator>
              <Check size={16} aria-hidden="true" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <p className="px-2.5 py-1.5 text-xs text-muted-foreground">{footer}</p>
    </DropdownMenuContent>
  )
}
