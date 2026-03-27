'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Pin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ItemSummary } from '@/lib/items'

interface ItemCardProps {
  item: ItemSummary
  isBulkMode?: boolean
  isSelected?: boolean
  onSelectChange?: (id: string, checked: boolean) => void
  onPinChange?: (id: string, pinned: boolean) => void
  onDelete?: (id: string) => void
}

export function ItemCard({
  item,
  isBulkMode = false,
  isSelected = false,
  onSelectChange,
  onPinChange: _onPinChange,
  onDelete: _onDelete,
}: ItemCardProps) {
  const tags = item.item_tags
    ?.map((it) => it.tags)
    .filter((t): t is { id: string; name: string } => t !== null) ?? []

  const visibleTags = tags.slice(0, 4)
  const extraTagCount = tags.length - visibleTags.length

  const isFailed = item.status === 'failed'
  const isProcessing = item.status === 'processing' || item.status === 'pending'
  const isDone = item.status === 'done'

  const cardContent = (
    <div
      className={cn(
        'relative flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-left transition-colors',
        isFailed && 'border-destructive',
        isDone && 'hover:bg-accent/50 cursor-pointer',
        isSelected && 'ring-2 ring-ring',
      )}
    >
      {/* Checkbox — hidden until bulk mode is wired (S407) */}
      {isBulkMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelectChange?.(item.id, e.target.checked)}
          className="absolute top-3 left-3 h-4 w-4 accent-foreground"
          aria-label={`Select item: ${item.subject ?? 'Untitled'}`}
        />
      )}

      {/* Header row: subject + pin */}
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            'truncate text-sm font-medium leading-snug',
            isBulkMode && 'pl-6',
          )}
        >
          {item.subject ?? '(No subject)'}
        </p>
        <button
          type="button"
          aria-label={item.pinned ? 'Pinned' : 'Not pinned'}
          className="shrink-0 text-muted-foreground"
          tabIndex={-1}
        >
          <Pin
            size={14}
            className={cn(item.pinned ? 'fill-foreground text-foreground' : 'opacity-40')}
          />
        </button>
      </div>

      {/* Summary / skeleton */}
      {isProcessing ? (
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <p className="text-xs text-muted-foreground">Processing…</p>
        </div>
      ) : isFailed ? (
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="shrink-0">
            Failed
          </Badge>
          <p className="truncate text-xs text-destructive">
            {item.error_message ?? 'An error occurred while processing this item.'}
          </p>
        </div>
      ) : (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {item.ai_summary ?? ''}
        </p>
      )}

      {/* Footer: tags + date */}
      <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-1">
          {visibleTags.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="text-xs py-0 px-1.5">
              {tag.name}
            </Badge>
          ))}
          {extraTagCount > 0 && (
            <Badge variant="secondary" className="text-xs py-0 px-1.5">
              +{extraTagCount} more
            </Badge>
          )}
        </div>
        <time
          dateTime={item.created_at}
          className="shrink-0 text-xs text-muted-foreground"
        >
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </time>
      </div>
    </div>
  )

  if (isDone) {
    return (
      <Link href={`/items/${item.id}`} className="block" tabIndex={isBulkMode ? -1 : 0}>
        {cardContent}
      </Link>
    )
  }

  return cardContent
}
