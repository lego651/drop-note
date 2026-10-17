'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { CategoryLite } from '@/lib/category-display'

type DeleteState = 'idle' | 'pending' | 'error'

interface DeleteCategoryDialogProps {
  open: boolean
  category: CategoryLite & { item_count: number }
  onOpenChange: (open: boolean) => void
  onDeleted: (reassigned: number) => void
  onPendingChange?: (pending: boolean) => void
}

function bodyCopy(name: string, count: number): string {
  if (count === 0) return 'This category is empty. This can’t be undone.'
  const base =
    count === 1
      ? 'Its 1 item will be re-sorted by AI into the closest remaining category, or Other if nothing fits.'
      : `Its ${count} items will be re-sorted by AI into the closest remaining category, or Other if nothing fits.`
  return `${base} Items you moved here by hand are re-sorted too. This can’t be undone.`
}

export function DeleteCategoryDialog({
  open,
  category,
  onOpenChange,
  onDeleted,
  onPendingChange,
}: DeleteCategoryDialogProps) {
  const [state, setState] = useState<DeleteState>('idle')

  useEffect(() => {
    if (open) setState('idle')
  }, [open])

  useEffect(() => {
    onPendingChange?.(state === 'pending')
  }, [state, onPendingChange])

  async function handleDelete() {
    setState('pending')
    try {
      const res = await fetch(`/api/categories/${category.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Couldn't delete “${category.name}”. Try again in a moment.`)
      }
      const data: { reassigned: number } = await res.json()
      toast({
        title:
          data.reassigned > 0
            ? `Deleted “${category.name}”. Re-sorted ${data.reassigned} items.`
            : `Deleted “${category.name}”.`,
      })
      onDeleted(data.reassigned)
    } catch {
      setState('error')
    }
  }

  const isPending = state === 'pending'

  return (
    <AlertDialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <AlertDialogContent
        onEscapeKeyDown={(e) => isPending && e.preventDefault()}
        onPointerDownOutside={(e) => isPending && e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="[overflow-wrap:anywhere] line-clamp-2">
            Delete &ldquo;{category.name}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>{bodyCopy(category.name, category.item_count)}</AlertDialogDescription>
        </AlertDialogHeader>

        {state === 'error' && (
          <div className="rounded-[10px] border-stroke bg-[hsl(var(--destructive)/0.10)] px-3 py-2.5 text-sm text-foreground">
            Couldn&apos;t delete &ldquo;{category.name}&rdquo;. Try again in a moment.
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault()
              handleDelete()
            }}
            className={cn(buttonVariants({ variant: 'destructive' }))}
          >
            {isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {category.item_count > 0 ? `Re-sorting ${category.item_count} items…` : 'Deleting…'}
              </>
            ) : (
              'Delete category'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
