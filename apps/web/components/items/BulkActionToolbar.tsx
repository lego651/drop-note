'use client'

import { useState } from 'react'
import { Trash2, Tag, X, FolderInput, Loader2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CategoryPickerContent } from '@/components/categories/CategoryPicker'
import type { BadgeCategory } from '@/components/categories/CategoryBadge'
import { toast } from '@/hooks/use-toast'
import type { CategoryLite } from '@/lib/category-display'
import type { Tier } from '@drop-note/shared'
import { cn } from '@/lib/utils'

const BULK_MOVE_LIMIT = 100

interface BulkActionToolbarProps {
  selectedIds: Set<string>
  allPageIds: string[]
  userTier: Tier
  categories?: CategoryLite[]
  onDeleted: (deletedIds: string[]) => void
  onTagged: (tagName: string) => void
  onMoved?: (ids: string[], category: BadgeCategory) => void
  /** Adds this page's ids to the (possibly cross-category) selection. */
  onSelectAll: (ids: string[]) => void
  /** Removes just this page's ids — unlike onDeselectAll, leaves picks from other categories intact. */
  onDeselectPage: () => void
  /** Clears the entire selection, across every category. */
  onDeselectAll: () => void
}

export function BulkActionToolbar({
  selectedIds,
  allPageIds,
  userTier,
  categories = [],
  onDeleted,
  onTagged,
  onMoved,
  onSelectAll,
  onDeselectPage,
  onDeselectAll,
}: BulkActionToolbarProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [isTagging, setIsTagging] = useState(false)
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const [movePopoverOpen, setMovePopoverOpen] = useState(false)

  const count = selectedIds.size
  const allPageSelected = allPageIds.length > 0 && allPageIds.every(id => selectedIds.has(id))
  const overMoveLimit = count > BULK_MOVE_LIMIT

  if (count === 0) return null

  async function handleMove(category: CategoryLite) {
    setMovePopoverOpen(false)
    setIsMoving(true)
    const ids = Array.from(selectedIds)
    try {
      const res = await fetch('/api/items/bulk-move-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, categoryId: category.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to move items')
      }
      const data: { moved: number } = await res.json()
      toast({ title: `Moved ${data.moved} items to ${category.name}.` })
      onMoved?.(ids, { id: category.id, name: category.name, position: category.position, is_other: category.is_other })
    } catch (err) {
      toast({
        title: 'Move failed',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setIsMoving(false)
    }
  }

  const deleteDescription =
    userTier === 'free'
      ? `Permanently delete ${count} ${count === 1 ? 'item' : 'items'}? This cannot be undone.`
      : `Move ${count} ${count === 1 ? 'item' : 'items'} to trash?`

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch('/api/items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to delete items')
      }
      toast({ title: `${count} ${count === 1 ? 'item' : 'items'} deleted.` })
      onDeleted(Array.from(selectedIds))
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleAddTag() {
    const trimmed = tagInput.trim()
    if (!trimmed) return
    setIsTagging(true)
    try {
      const res = await fetch('/api/items/bulk-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), tag: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to add tag')
      }
      toast({ title: `Tag "${trimmed}" added to ${count} ${count === 1 ? 'item' : 'items'}.` })
      setTagInput('')
      setTagPopoverOpen(false)
      onTagged(trimmed)
    } catch (err) {
      toast({
        title: 'Tag failed',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setIsTagging(false)
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-[10px] border-stroke border-ink bg-card px-3 py-2 shadow-ink-md">
      {/* Select all on page checkbox */}
      <label className="relative flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none after:absolute after:-inset-[14px] after:content-[''] sm:after:hidden">
        <Checkbox
          checked={allPageSelected}
          onCheckedChange={(checked) => {
            if (checked) onSelectAll(allPageIds)
            else onDeselectPage()
          }}
          aria-label="Select all on this page"
        />
        <span className="hidden sm:inline">Select all</span>
      </label>

      <span className="whitespace-nowrap text-sm font-medium">
        {count} selected
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Add tag popover */}
        <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-11 min-w-11 px-3 sm:h-9 sm:px-4" disabled={isTagging}>
              <Tag size={14} />
              <span className="hidden sm:inline">Add tag</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Add tag to {count} {count === 1 ? 'item' : 'items'}</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Tag name…"
                  enterKeyHint="done"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTag()
                  }}
                  className="h-11 text-base sm:h-8 sm:text-sm"
                  disabled={isTagging}
                  autoFocus
                />
                <Button size="sm" className="h-11 px-4 sm:h-8" onClick={handleAddTag} disabled={isTagging || !tagInput.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Move to category */}
        <DropdownMenu open={movePopoverOpen} onOpenChange={setMovePopoverOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-11 min-w-11 px-3 sm:h-9 sm:px-4"
              disabled={isMoving || overMoveLimit}
              aria-disabled={overMoveLimit}
              aria-label={`Move ${count} items to a category`}
              title={overMoveLimit ? 'You can move up to 100 items at a time.' : undefined}
            >
              {isMoving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FolderInput size={14} />
              )}
              <span className="hidden sm:inline">{isMoving ? 'Moving…' : 'Move to…'}</span>
              {overMoveLimit && (
                <span className="sr-only">You can move up to 100 items at a time.</span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <CategoryPickerContent
            categories={categories}
            onSelect={handleMove}
            label={`Move ${count} ${count === 1 ? 'item' : 'items'} to`}
            footer="Moving them locks them. AI won't re-sort them."
            align="end"
            side="bottom"
          />
        </DropdownMenu>

        {/* Delete with confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="h-11 min-w-11 px-3 sm:h-9 sm:px-4" disabled={isDeleting}>
              <Trash2 size={14} />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {userTier === 'free' ? 'Delete items?' : 'Move to trash?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className={cn(buttonVariants({ variant: 'destructive' }))}
              >
                {userTier === 'free' ? 'Delete permanently' : 'Move to trash'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Deselect all */}
        <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" onClick={onDeselectAll} aria-label="Deselect all">
          <X size={14} />
        </Button>
      </div>
    </div>
  )
}
