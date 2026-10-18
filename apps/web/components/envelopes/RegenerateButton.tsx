'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
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
import { Button, buttonVariants } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/**
 * Regenerate-with-edits (DRO-195): re-runs generation from the same items and
 * intent text. The current checked/edited leaves are fed back into the
 * prompt as hints (see buildEnvelopeRegenerationContext in packages/shared) —
 * not structurally merged, since a regeneration can reshape sections
 * entirely. On success the page re-fetches and shows the "generating" poller
 * again, same as the first generation.
 */
export function RegenerateButton({ envelopeId }: { envelopeId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  async function handleRegenerate() {
    setIsPending(true)
    try {
      const res = await fetch(`/api/envelopes/${envelopeId}/regenerate`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to regenerate')
      }
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast({
        title: "Couldn't regenerate this plan",
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RefreshCw size={14} aria-hidden="true" />
          Regenerate
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onEscapeKeyDown={(e) => isPending && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Regenerate this plan?</AlertDialogTitle>
          <AlertDialogDescription>
            This makes a fresh version from your items and request. Checked and edited lines are passed along as
            hints, but the new plan may not keep all of them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault()
              handleRegenerate()
            }}
            className={cn(buttonVariants({ variant: 'default' }))}
          >
            {isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                Regenerating…
              </>
            ) : (
              'Regenerate'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
