'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryBadge } from '@/components/categories/CategoryBadge'
import { toast } from '@/hooks/use-toast'
import type { CategoryLite } from '@/lib/category-display'

type ResortCandidate = { itemId: string; subject: string | null; currentCategoryId: string | null }

type LoadState = 'loading' | 'results' | 'empty' | 'error'
type ApplyState = 'idle' | 'applying' | 'apply-error'

interface ResortDialogProps {
  open: boolean
  category: CategoryLite
  /** Full category list, used to render "from (■ Category)" on each candidate row. */
  categories: CategoryLite[]
  onOpenChange: (open: boolean) => void
  /** Called after a successful apply, so the caller can refresh sidebar counts. */
  onApplied?: () => void
}

export function ResortDialog({ open, category, categories, onOpenChange, onApplied }: ResortDialogProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [applyState, setApplyState] = useState<ApplyState>('idle')
  const [candidates, setCandidates] = useState<ResortCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoadState('loading')
    setApplyState('idle')

    fetch(`/api/categories/${category.id}/resort`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to check items')
        const data: { candidates: ResortCandidate[] } = await res.json()
        setCandidates(data.candidates)
        setSelected(new Set(data.candidates.map((c) => c.itemId)))
        setLoadState(data.candidates.length === 0 ? 'empty' : 'results')
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return
        setLoadState('error')
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category.id])

  function categoryFor(id: string | null): CategoryLite | undefined {
    return id ? categories.find((c) => c.id === id) : undefined
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(candidates.map((c) => c.itemId)) : new Set())
  }

  function toggleOne(itemId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  async function handleApply() {
    setApplyState('applying')
    try {
      const res = await fetch(`/api/categories/${category.id}/resort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [...selected] }),
      })
      if (!res.ok) throw new Error('Failed to move items')
      const data: { moved: number } = await res.json()
      toast({ title: `Moved ${data.moved} items to ${category.name}.` })
      onApplied?.()
      onOpenChange(false)
    } catch {
      setApplyState('apply-error')
    }
  }

  function handleRetryPreview() {
    setLoadState('loading')
    fetch(`/api/categories/${category.id}/resort`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to check items')
        const data: { candidates: ResortCandidate[] } = await res.json()
        setCandidates(data.candidates)
        setSelected(new Set(data.candidates.map((c) => c.itemId)))
        setLoadState(data.candidates.length === 0 ? 'empty' : 'results')
      })
      .catch(() => setLoadState('error'))
  }

  const isPending = loadState === 'loading' || applyState === 'applying'
  const allChecked = candidates.length > 0 && selected.size === candidates.length
  const someChecked = selected.size > 0 && selected.size < candidates.length

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent
        className="max-w-lg"
        onEscapeKeyDown={(e) => isPending && e.preventDefault()}
        onPointerDownOutside={(e) => isPending && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="pr-8 text-lg font-semibold [overflow-wrap:anywhere] line-clamp-2">
            Re-sort existing items into &ldquo;{category.name}&rdquo;?
          </DialogTitle>
          <DialogDescription>
            Here are the items AI thinks fit better in &ldquo;{category.name}&rdquo;. Uncheck any you want to
            leave where they are.
          </DialogDescription>
        </DialogHeader>

        {loadState === 'loading' && (
          <div className="space-y-3">
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Checking your items…
            </p>
            <div className="rounded-[10px] border-stroke border-ink">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-3 py-2.5">
                  <Skeleton className="h-4 w-4" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loadState === 'results' && (
          <>
            <div className="max-h-[50vh] overflow-y-auto rounded-[10px] border-stroke border-ink sm:max-h-[50vh]">
              <label className="sticky top-0 flex items-center gap-3 border-b border-border bg-card px-3 py-2.5">
                <Checkbox
                  checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                  onCheckedChange={(c) => toggleAll(c === true)}
                  aria-label={`Select all (${candidates.length})`}
                  disabled={applyState === 'applying'}
                />
                <span className="text-sm font-medium">Select all ({candidates.length})</span>
              </label>
              <div className="divide-y divide-border">
                {candidates.map((c) => {
                  const from = categoryFor(c.currentCategoryId)
                  return (
                    <label
                      key={c.itemId}
                      className="flex cursor-pointer gap-3 px-3 py-2.5 hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={selected.has(c.itemId)}
                        onCheckedChange={(checked) => toggleOne(c.itemId, checked === true)}
                        disabled={applyState === 'applying'}
                        aria-label={c.subject ?? '(No subject)'}
                      />
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="line-clamp-1 block text-sm font-medium [overflow-wrap:anywhere]">
                          {c.subject ?? '(No subject)'}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          from
                          {from ? <CategoryBadge category={from} /> : <span>—</span>}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Items you moved by hand stay where they are.</p>
          </>
        )}

        {loadState === 'empty' && (
          <p className="text-sm text-muted-foreground">
            Nothing you&apos;ve saved fits &ldquo;{category.name}&rdquo; better right now. New items that fit
            will be filed here automatically.
          </p>
        )}

        {loadState === 'error' && (
          <DangerNotice>
            Couldn&apos;t check your items. Your category was created and nothing was moved.
          </DangerNotice>
        )}

        {applyState === 'apply-error' && (
          <DangerNotice>Couldn&apos;t move these items. Nothing was changed.</DangerNotice>
        )}

        <DialogFooter>
          {loadState === 'empty' ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : loadState === 'error' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={handleRetryPreview}>Try again</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applyState === 'applying'}>
                Not now
              </Button>
              <Button onClick={handleApply} disabled={loadState !== 'results' || applyState === 'applying' || selected.size === 0}>
                {applyState === 'applying' ? (
                  <>
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    Moving…
                  </>
                ) : applyState === 'apply-error' ? (
                  'Try again'
                ) : selected.size === 0 ? (
                  'Move items'
                ) : (
                  `Move ${selected.size} ${selected.size === 1 ? 'item' : 'items'}`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** AIRMAIL D-4 danger notice: ink-stroke outline in the destructive color, tint over --card. */
function DangerNotice({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-[10px] border-stroke px-3 py-2.5"
      style={{
        backgroundColor: 'hsl(var(--destructive) / 0.08)',
        borderColor: 'hsl(var(--destructive) / 0.45)',
      }}
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive-text" aria-hidden="true" />
      <p className="text-sm text-foreground">{children}</p>
    </div>
  )
}
