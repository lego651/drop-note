'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
import { toast } from '@/hooks/use-toast'

interface TrashActionsProps {
  itemCount: number
}

export function TrashActions({ itemCount }: TrashActionsProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  if (itemCount === 0) return null

  async function handleEmptyTrash() {
    setIsLoading(true)
    try {
      const res = await fetch('/api/items/trash', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to empty trash')
      }
      const data = await res.json()
      toast({ title: `Permanently deleted ${data.deleted} ${data.deleted === 1 ? 'item' : 'items'}.` })
      router.refresh()
    } catch (err) {
      toast({
        title: 'Failed to empty trash',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={isLoading}>
          Empty trash
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Empty trash?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete all {itemCount} {itemCount === 1 ? 'item' : 'items'} in
            trash. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleEmptyTrash}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Empty trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
