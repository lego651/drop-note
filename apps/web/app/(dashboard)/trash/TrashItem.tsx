'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'

interface TrashItemData {
  id: string
  subject: string | null
  ai_summary: string | null
  filename: string | null
  type: string | null
}

interface TrashItemProps {
  item: TrashItemData
  deletedAt: Date
  deletedAtFormatted: string
  daysLeft: number
}

export function TrashItem({ item, deletedAtFormatted, daysLeft }: TrashItemProps) {
  const [isRestoring, setIsRestoring] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [removed, setRemoved] = useState(false)
  const router = useRouter()

  if (removed) return null

  const title = item.subject ?? item.filename ?? '(No subject)'
  const isExpiringSoon = daysLeft <= 3

  async function handleRestore() {
    setIsRestoring(true)
    try {
      const res = await fetch(`/api/items/${item.id}/restore`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to restore item')
      }
      toast({ title: 'Item restored.' })
      setRemoved(true)
      router.refresh()
    } catch (err) {
      toast({
        title: 'Restore failed',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setIsRestoring(false)
    }
  }

  async function handleDeleteForever() {
    setIsDeleting(true)
    try {
      // DELETE /api/items/[id] — item is already in trash so deleteItem will hard-delete it
      const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to delete item')
      }
      toast({ title: 'Item permanently deleted.' })
      setRemoved(true)
      router.refresh()
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

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {item.ai_summary && (
          <p className="line-clamp-1 text-xs text-muted-foreground mt-0.5">{item.ai_summary}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Deleted {deletedAtFormatted} ·{' '}
          <span className={isExpiringSoon ? 'text-destructive font-medium' : ''}>
            {daysLeft === 0 ? 'Expiring today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRestore}
          disabled={isRestoring || isDeleting}
          aria-label="Restore item"
        >
          <RotateCcw size={14} />
          <span className="hidden sm:inline">Restore</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDeleteForever}
          disabled={isRestoring || isDeleting}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          aria-label="Delete forever"
        >
          <Trash2 size={14} />
          <span className="hidden sm:inline">Delete forever</span>
        </Button>
      </div>
    </div>
  )
}
