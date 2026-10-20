'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Pin, Trash2, Play, FileText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { VideoModal } from '@/components/VideoModal'
import { ItemCategoryControl } from '@/components/categories/ItemCategoryControl'
import { CategoryBadge, type BadgeCategory } from '@/components/categories/CategoryBadge'
import { cn } from '@/lib/utils'
import { colorForTagHsl, SOURCE_DOT } from '@/lib/design-tokens'
import type { ItemSummary } from '@/lib/items'
import type { CategoryLite } from '@/lib/category-display'
import { extractYouTubeId } from '@drop-note/shared'

interface ListCardProps {
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
      month: 'long',
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

export function ListCard({
  item,
  isBulkMode = false,
  isSelected = false,
  categories = [],
  onSelectChange,
  onPinChange,
  onDelete,
  onCategoryMoved,
}: ListCardProps) {
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
    // Outer wrapper is intentionally NOT overflow-hidden: the pin/delete buttons live here
    // (not inside the clipped thumbnail box) so they're never clipped by the mobile 64px
    // thumbnail, and min-h reserves enough room so the stacked touch targets stay inside
    // this card instead of bleeding into the next one. DRO-240 + DRO-251.
    <div className="relative min-h-[104px] shrink-0">
      <div className="relative h-16 w-16 overflow-hidden rounded-lg border-stroke border-ink bg-muted sm:h-[104px] sm:w-[148px]">
        {isDone && item.thumbnail_url ? (
          <>
            <Image
              src={item.thumbnail_url}
              alt={item.subject ?? ''}
              fill
              className="object-cover"
              sizes="(max-width: 639px) 64px, 148px"
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
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  style={{ boxShadow: '0 0 0 2px hsl(var(--badge-ring))' }}
                >
                  <Play size={14} className="ml-0.5 fill-current" />
                </span>
              </button>
            )}
          </>
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ backgroundColor: `hsl(${placeholderHsl} / 0.12)` }}
          >
            <FileText size={30} style={{ color: `hsl(${placeholderHsl})` }} />
          </div>
        )}
      </div>
      {/* Pin / delete — over the thumbnail so they never cover the title text. Visible on
          hover (desktop) and always on touch (no :hover) devices, DRO-240. Stacked vertically
          on touch (instead of side by side) so the 44px targets stay clear of the centred
          YouTube play button rather than overlapping its top half. */}
      {!isBulkMode && (
        <div className="absolute right-1.5 top-1.5 z-10 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:flex-col [@media(hover:none)]:gap-1 [@media(hover:none)]:opacity-100">
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
            <Pin size={13} className={cn(item.pinned && 'fill-foreground text-foreground')} />
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
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      {/* Meta row: dot · domain · read time · date */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: SOURCE_DOT[item.source_type ?? 'default'] }}
          aria-hidden="true"
        />
        <span className="truncate">{sourceLabel(item)}</span>
        {readMin && (
          <>
            <span aria-hidden="true">·</span>
            <span>{readMin} min read</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
      </div>

      {/* Title */}
      <h3 className="truncate text-[15px] font-semibold leading-snug text-foreground">
        {item.subject ?? '(No subject)'}
      </h3>

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
        <p className="line-clamp-2 text-sm text-muted-foreground">{item.ai_summary ?? ''}</p>
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
    </div>
  )

  const card = (
    <article
      className={cn(
        'lift group relative flex items-start gap-3 rounded-xl border-stroke border-ink bg-card p-4 shadow-ink-lg sm:gap-5',
        isSelected && 'ring-2 ring-ring ring-offset-2',
        isBulkMode && 'cursor-pointer',
      )}
      style={item.pinned ? { borderColor: PIN } : undefined}
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
      {/* Bulk checkbox */}
      {isBulkMode && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={(c) => onSelectChange?.(item.id, c === true)}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 shrink-0"
          aria-label={`Select item: ${item.subject ?? 'Untitled'}`}
        />
      )}

      {media}
      {body}
    </article>
  )

  return (
    <>
      {isDone && !isBulkMode ? (
        <Link href={`/items/${item.id}`} className="block">
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
