'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Sparkles } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CategoryBadge, type BadgeCategory } from '@/components/categories/CategoryBadge'
import { CategoryPickerContent } from '@/components/categories/CategoryPicker'
import { toast } from '@/hooks/use-toast'
import type { CategoryLite } from '@/lib/category-display'

interface ItemCategoryControlProps {
  itemId: string
  category: BadgeCategory
  locked: boolean
  /** All of the user's categories (including hidden), for the picker list. */
  categories: CategoryLite[]
  size?: 'sm' | 'lg'
  /** True when this badge lives inside a card wrapped in a <Link>. */
  insideLink?: boolean
  /** Item detail shows a lock/AI hint next to the badge; cards don't. */
  showLockHint?: boolean
  onMoved?: (itemId: string, category: BadgeCategory, locked: boolean) => void
}

/**
 * Wires CategoryBadge + CategoryPicker together for a single item: optimistic
 * move, toast, and a router.refresh() so sidebar counts stay in sync. Used by
 * every card layout and the item detail page.
 */
export function ItemCategoryControl({
  itemId,
  category,
  locked,
  categories,
  size = 'sm',
  insideLink = false,
  showLockHint = false,
  onMoved,
}: ItemCategoryControlProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [override, setOverride] = useState<{ category: BadgeCategory; locked: boolean } | null>(null)

  const displayCategory = override?.category ?? category
  const displayLocked = override?.locked ?? locked

  async function handleSelect(picked: CategoryLite) {
    const nextCategory: BadgeCategory = {
      id: picked.id,
      name: picked.name,
      position: picked.position,
      is_other: picked.is_other,
    }
    setOverride({ category: nextCategory, locked: true })
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: picked.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to move item')
      }
      toast({ title: `Moved to ${picked.name}.` })
      onMoved?.(itemId, nextCategory, true)
      setOverride(null)
      startTransition(() => router.refresh())
    } catch (err) {
      setOverride(null)
      toast({
        title: "Couldn't move this item",
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <CategoryBadge
            category={displayCategory}
            size={size}
            interactive
            onClick={
              insideLink
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }
                : undefined
            }
            onPointerDown={insideLink ? (e) => e.stopPropagation() : undefined}
          />
        </DropdownMenuTrigger>
        <CategoryPickerContent
          categories={categories}
          currentCategoryId={displayCategory.id}
          onSelect={handleSelect}
          label="Move to"
          footer="Moving it here locks it. AI won't re-sort it."
          align="start"
          side="bottom"
          onContentClick={insideLink ? (e) => e.stopPropagation() : undefined}
        />
      </DropdownMenu>
      {showLockHint && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {displayLocked ? (
            <>
              <Lock size={12} aria-hidden="true" />
              Set by you · AI won&apos;t change it
            </>
          ) : (
            <>
              <Sparkles size={12} aria-hidden="true" />
              Picked by AI
            </>
          )}
        </span>
      )}
    </div>
  )
}
