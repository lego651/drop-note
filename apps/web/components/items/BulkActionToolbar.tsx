'use client'

import { useState } from 'react'
import { Trash2, Tag, X, CheckSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { toast } from '@/hooks/use-toast'
import type { Tier } from '@drop-note/shared'

interface BulkActionToolbarProps {
  selectedIds: Set<string>
  allPageIds: string[]
  userTier: Tier
  onDeleted: (deletedIds: string[]) => void
  onTagged: (tagName: string) => void
  onSelectAll: (ids: string[]) => void
  onDeselectAll: () => void
}

export function BulkActionToolbar({
  selectedIds,
  allPageIds,
  userTier,
  onDeleted,
  onTagged,
  onSelectAll,
  onDeselectAll,
}: BulkActionToolbarProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [isTagging, setIsTagging] = useState(false)
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)

  const count = selectedIds.size
  const allPageSelected = allPageIds.length > 0 && allPageIds.every(id => selectedIds.has(id))

  if (count === 0) return null

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
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
      {/* Select all on page checkbox */}
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={allPageSelected}
          onChange={(e) => {
            if (e.target.checked) onSelectAll(allPageIds)
            else onDeselectAll()
          }}
          className="h-4 w-4 accent-foreground"
          aria-label="Select all on this page"
        />
        <CheckSquare size={14} className="hidden" aria-hidden />
        <span className="hidden sm:inline">Select all</span>
      </label>

      <span className="text-sm font-medium">
        {count} selected
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Add tag popover */}
        <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={isTagging}>
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
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTag()
                  }}
                  className="h-8 text-sm"
                  disabled={isTagging}
                  autoFocus
                />
                <Button size="sm" onClick={handleAddTag} disabled={isTagging || !tagInput.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Delete with confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={isDeleting}>
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
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {userTier === 'free' ? 'Delete permanently' : 'Move to trash'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Deselect all */}
        <Button variant="ghost" size="sm" onClick={onDeselectAll} aria-label="Deselect all">
          <X size={14} />
        </Button>
      </div>
    </div>
  )
}
