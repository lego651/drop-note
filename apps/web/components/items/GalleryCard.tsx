'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Pin, Trash2, Play, FileText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { VideoModal } from '@/components/VideoModal'
import { ItemFavicon } from '@/components/ItemFavicon'
import { ItemCategoryControl } from '@/components/categories/ItemCategoryControl'
import { CategoryBadge, type BadgeCategory } from '@/components/categories/CategoryBadge'
import { cn } from '@/lib/utils'
import { colorForTagHsl } from '@/lib/design-tokens'
import type { ItemSummary } from '@/lib/items'
import type { CategoryLite } from '@/lib/category-display'
import { extractYouTubeId } from '@drop-note/shared'

interface GalleryCardProps {
  item: ItemSummary
  isBulkMode?: boolean
  isSelected?: boolean
  categories?: CategoryLite[]
  onSelectChange?: (id: string, checked: boolean) => void
  onPinChange?: (id: string, pinned: boolean) => void
  onDelete?: (id: string) => void
  onCategoryMoved?: (itemId: string, category: BadgeCategory, locked: boolean) => void
}

const PIN = 'hsl(var(--color-pin))'

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function sourceLabel(item: ItemSummary): string {
  if (item.source_url) {
    try {
      return new URL(item.source_url).hostname.replace(/^www\./, '')
    } catch {
      // fall through
    }
  }
  if (item.sender_email?.includes('@')) return item.sender_email.split('@')[1]
  return 'email'
}

export function GalleryCard({
  item,
  isBulkMode = false,
  isSelected = false,
  categories = [],
  onSelectChange,
  onPinChange,
  onDelete,
  onCategoryMoved,
}: GalleryCardProps) {
  const [videoOpen, setVideoOpen] = useState(false)

  const isFailed = item.status === 'failed'
  const isProcessing = item.status === 'processing' || item.status === 'pending'
  const isDone = item.status === 'done'

  const youtubeId =
    item.source_type === 'youtube' && item.source_url
      ? extractYouTubeId(item.source_url)
      : null

  const readMin =
    isDone && item.ai_summary
      ? Math.max(1, Math.round(item.ai_summary.split(/\s+/).length / 200))
      : null

  const placeholderHsl = colorForTagHsl(item.subject ?? sourceLabel(item))

  const media = (
    <div className="relative aspect-[16/10] w-full overflow-hidden border-b-stroke border-ink bg-muted">
      {isDone && item.thumbnail_url ? (
        <>
          <Image
            src={item.thumbnail_url}
            alt={item.subject ?? ''}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
          {youtubeId && (
            <button
              type="button"
              aria-label="Play video"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setVideoOpen(true)
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <span
                className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-primary text-primary-foreground"
                style={{ boxShadow: '0 0 0 2.5px hsl(var(--badge-ring))' }}
              >
                <Play size={20} className="ml-0.5 fill-current" />
              </span>
            </button>
          )}
        </>
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ backgroundColor: `hsl(${placeholderHsl} / 0.12)` }}
        >
          <FileText size={32} style={{ color: `hsl(${placeholderHsl})` }} />
        </div>
      )}

      {/* Pinned badge */}
      {item.pinned && (
        <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border-stroke border-ink bg-card">
          <Pin size={13} style={{ color: PIN, fill: PIN }} />
        </span>
      )}

      {/* Bulk checkbox */}
      {isBulkMode && (
        <span className="absolute right-3 top-3 rounded bg-card/90 p-0.5">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(c) => onSelectChange?.(item.id, c === true)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select item: ${item.subject ?? 'Untitled'}`}
          />
        </span>
      )}

      {/* Pin / delete — visible on hover (desktop) and always on touch (no :hover) devices, DRO-240 */}
      {!isBulkMode && (
        <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
          <button
            type="button"
            aria-label={item.pinned ? 'Unpin item' : 'Pin item'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onPinChange?.(item.id, !item.pinned)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border-stroke border-ink bg-card text-muted-foreground shadow-ink-sm transition-colors hover:text-foreground [@media(hover:none)]:h-11 [@media(hover:none)]:w-11"
          >
            <Pin
              size={13}
              className={cn(item.pinned && 'fill-foreground text-foreground')}
            />
          </button>
          <button
            type="button"
            aria-label="Delete item"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete?.(item.id)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border-stroke border-ink bg-card text-muted-foreground shadow-ink-sm transition-colors hover:text-destructive [@media(hover:none)]:h-11 [@media(hover:none)]:w-11"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )

  const body = (
    <div className="flex flex-1 flex-col gap-2 p-4">
      <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
        {item.subject ?? '(No subject)'}
      </h3>

      {/* Source meta */}
      <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <ItemFavicon sourceUrl={item.source_url} sourceType={item.source_type} size={14} />
        <span className="truncate">{sourceLabel(item)}</span>
        {readMin && (
          <>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{readMin} min read</span>
          </>
        )}
      </div>

      {/* Summary / state */}
      {isProcessing ? (
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ) : isFailed ? (
        <Badge variant="destructive" className="w-fit">
          Failed
        </Badge>
      ) : (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {item.ai_summary ?? ''}
        </p>
      )}

      {/* Category badge */}
      {item.category ? (
        isBulkMode ? (
          <CategoryBadge category={item.category} className="self-start" />
        ) : (
          <ItemCategoryControl
            itemId={item.id}
            category={item.category}
            locked={item.category_locked ?? false}
            categories={categories}
            insideLink
            onMoved={onCategoryMoved}
          />
        )
      ) : isProcessing ? (
        <Skeleton className="h-[22px] w-24 rounded-full" />
      ) : null}

      {/* Divider + full date */}
      {/* Postmark divider + mono date + mini airmail stripe (AIRMAIL § 7) */}
      <div className="mt-auto flex items-center justify-between border-t-stroke border-dashed border-ink/35 pt-3">
        <time
          dateTime={item.created_at}
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground"
        >
          {formatDate(item.created_at)}
        </time>
        <span className="stripe-mini" aria-hidden="true" />
      </div>
    </div>
  )

  const card = (
    <article
      className={cn(
        'lift group relative flex h-full flex-col overflow-hidden rounded-xl border-stroke border-ink bg-card shadow-ink-lg',
        isSelected && 'ring-2 ring-ring ring-offset-2',
        isBulkMode && 'cursor-pointer',
      )}
      style={
        item.pinned
          ? { borderColor: PIN }
          : isFailed
            ? { borderColor: 'hsl(var(--destructive))' }
            : undefined
      }
      role={isBulkMode ? 'button' : undefined}
      tabIndex={isBulkMode ? 0 : undefined}
      aria-pressed={isBulkMode ? isSelected : undefined}
      onClick={isBulkMode ? () => onSelectChange?.(item.id, !isSelected) : undefined}
      onKeyDown={
        isBulkMode
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectChange?.(item.id, !isSelected)
              }
            }
          : undefined
      }
    >
      {media}
      {body}
    </article>
  )

  return (
    <>
      {isDone && !isBulkMode ? (
        <Link href={`/items/${item.id}`} className="block h-full">
          {card}
        </Link>
      ) : (
        card
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
