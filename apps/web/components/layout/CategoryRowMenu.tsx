'use client'

import { Ellipsis, Pencil, Eye, EyeOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { CategoryLite } from '@/lib/category-display'

interface CategoryRowMenuProps {
  category: CategoryLite
  align?: 'start' | 'end'
  side?: 'right' | 'bottom'
  onRename: () => void
  onToggleHidden: () => void
  onDeleteRequest: () => void
}

const DESTRUCTIVE_ITEM =
  'text-destructive-text focus:bg-[hsl(var(--destructive)/0.08)] focus:text-destructive-text'

export function CategoryRowMenu({
  category,
  align = 'start',
  side = 'right',
  onRename,
  onToggleHidden,
  onDeleteRequest,
}: CategoryRowMenuProps) {
  const hideHelperId = `category-hide-helper-${category.id}`
  const deleteReasonId = `category-delete-reason-${category.id}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Options for ${category.name}`}
          className={cn(
            'absolute right-0 inset-y-0 my-auto h-9 w-9 rounded-lg text-muted-foreground hover:text-accent-foreground',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
            "[@media(hover:none)]:opacity-100",
          )}
        >
          <Ellipsis size={16} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-60">
        <DropdownMenuItem onSelect={onRename}>
          <Pencil size={16} aria-hidden="true" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onToggleHidden}
          aria-describedby={category.hidden ? undefined : hideHelperId}
        >
          {category.hidden ? (
            <Eye size={16} aria-hidden="true" />
          ) : (
            <EyeOff size={16} aria-hidden="true" />
          )}
          <span className="flex flex-col gap-0.5 py-0.5">
            <span>{category.hidden ? 'Unhide' : 'Hide'}</span>
            {!category.hidden && (
              <span id={hideHelperId} className="text-xs text-muted-foreground">
                AI stops filing new items here
              </span>
            )}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {category.is_other ? (
          <DropdownMenuItem
            aria-disabled="true"
            aria-describedby={deleteReasonId}
            onSelect={(e) => e.preventDefault()}
            className={cn(DESTRUCTIVE_ITEM, 'cursor-not-allowed')}
          >
            <Trash2 size={16} aria-hidden="true" className="opacity-60" />
            <span className="flex flex-col gap-0.5 py-0.5">
              <span className="opacity-60">Delete…</span>
              <span id={deleteReasonId} className="text-xs text-muted-foreground opacity-100">
                Other can&apos;t be deleted. Items go here when nothing else fits.
              </span>
            </span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={onDeleteRequest} className={DESTRUCTIVE_ITEM}>
            <Trash2 size={16} aria-hidden="true" />
            Delete…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
