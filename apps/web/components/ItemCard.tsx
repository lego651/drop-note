'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pin, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { VideoModal } from '@/components/VideoModal'
import { ItemThumbnail } from '@/components/ItemThumbnail'
import { cn } from '@/lib/utils'
import type { ItemSummary } from '@/lib/items'
import { extractYouTubeId } from '@drop-note/shared'

interface ItemCardProps {
  item: ItemSummary
  isBulkMode?: boolean
  isListView?: boolean
  isSelected?: boolean
  onSelectChange?: (id: string, checked: boolean) => void
  onPinChange?: (id: string, pinned: boolean) => void
  onDelete?: (id: string) => void
}

export function ItemCard({
  item,
  isBulkMode = false,
  isListView = false,
  isSelected = false,
  onSelectChange,
  onPinChange,
  onDelete,
}: ItemCardProps) {
  const [videoOpen, setVideoOpen] = useState(false)

  const tags = item.item_tags
    ?.map((it) => it.tags)
    .filter((t): t is { id: string; name: string } => t !== null) ?? []

  const visibleTags = tags.slice(0, 3)
  const extraTagCount = tags.length - visibleTags.length

  function compactAge(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 60) return `${Math.max(m, 1)}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}d`
    const mo = Math.floor(d / 30)
    if (mo < 12) return `${mo}mo`
    return `${Math.floor(mo / 12)}y`
  }

  const isFailed = item.status === 'failed'
  const isProcessing = item.status === 'processing' || item.status === 'pending'
  const isDone = item.status === 'done'

  const youtubeId = item.source_type === 'youtube' && item.source_url
    ? extractYouTubeId(item.source_url)
    : null

  const cardContent = (
    <div
      className={cn(
        'group relative flex gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors',
        isListView ? 'flex-row items-start' : 'flex-col',
        isFailed && 'border-destructive',
        isDone && 'hover:bg-accent/50 cursor-pointer',
        isSelected && 'ring-2 ring-ring',
        isProcessing && 'motion-safe:animate-pulse',
      )}
    >
      {/* Checkbox — visible in bulk mode */}
      {isBulkMode && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onSelectChange?.(item.id, checked === true)}
          className="absolute top-3 left-3"
          aria-label={`Select item: ${item.subject ?? 'Untitled'}`}
        />
      )}

      {/* Text content — fills remaining space */}
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
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
          aria-label={item.pinned ? 'Unpin item' : 'Pin item'}
          className="shrink-0 text-muted-foreground"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onPinChange?.(item.id, !item.pinned)
          }}
        >
          <Pin
            size={14}
            className={cn(item.pinned ? 'fill-foreground text-foreground' : 'opacity-40')}
          />
        </button>
        <button
          type="button"
          aria-label="Delete item"
          className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDelete?.(item.id)
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Thumbnail — grid view only (list view renders it as right column) */}
      {!isListView && isDone && item.thumbnail_url && (
        <ItemThumbnail
          thumbnailUrl={item.thumbnail_url}
          subject={item.subject}
          youtubeId={youtubeId}
          isListView={false}
          onVideoOpen={() => setVideoOpen(true)}
        />
      )}

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
      <div className="flex items-center justify-between gap-2 pt-0.5 min-w-0">
        <div className="flex items-center gap-1 overflow-hidden">
          {visibleTags.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="text-xs py-0 px-1.5 shrink-0">
              {tag.name}
            </Badge>
          ))}
          {extraTagCount > 0 && (
            <Badge variant="secondary" className="text-xs py-0 px-1.5 shrink-0">
              +{extraTagCount}
            </Badge>
          )}
        </div>
        <time
          dateTime={item.created_at}
          className="shrink-0 text-xs text-muted-foreground"
        >
          {compactAge(item.created_at)}
        </time>
      </div>
      </div>{/* end text content */}

      {/* Thumbnail — list view right column */}
      {isListView && isDone && item.thumbnail_url && (
        <ItemThumbnail
          thumbnailUrl={item.thumbnail_url}
          subject={item.subject}
          youtubeId={youtubeId}
          isListView={true}
          onVideoOpen={() => setVideoOpen(true)}
        />
      )}
    </div>
  )

  return (
    <>
      {isDone ? (
        <Link href={`/items/${item.id}`} className="block" tabIndex={isBulkMode ? -1 : 0}>
          {cardContent}
        </Link>
      ) : (
        cardContent
      )}

      <VideoModal
        open={videoOpen}
        videoId={youtubeId ?? ''}
        title={item.subject ?? 'Video'}
        onClose={() => setVideoOpen(false)}
      />
    </>
  )
}
