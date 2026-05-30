'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Clock, FileText } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { colorForTagHsl, SOURCE_DOT } from '@/lib/design-tokens'
import type { ItemSummary } from '@/lib/items'

interface CompactListLayoutProps {
  items: ItemSummary[]
  isBulkMode?: boolean
  selectedIds?: Set<string>
  onSelectChange?: (id: string, checked: boolean) => void
  onPinChange?: (id: string, pinned: boolean) => void
  onDelete?: (id: string) => void
}

const PIN = 'hsl(var(--color-pin))'

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

function CompactRow({
  item,
  isBulkMode,
  isSelected,
  onSelectChange,
}: {
  item: ItemSummary
  isBulkMode: boolean
  isSelected: boolean
  onSelectChange?: (id: string, checked: boolean) => void
}) {
  const isDone = item.status === 'done'
  const tags =
    item.item_tags
      ?.map((it) => it.tags)
      .filter((t): t is { id: string; name: string } => t !== null) ?? []
  const firstTag = tags[0]
  const tagHsl = firstTag ? colorForTagHsl(firstTag.name) : ''

  const readMin =
    isDone && item.ai_summary
      ? Math.max(1, Math.round(item.ai_summary.split(/\s+/).length / 200))
      : null

  const placeholderHsl = colorForTagHsl(item.subject ?? sourceLabel(item))

  const row = (
    <article
      className={cn(
        'group flex items-center gap-3 rounded-2xl bg-card px-3 py-3.5 shadow-sm transition-shadow hover:shadow-md',
        isSelected && 'ring-2 ring-ring',
      )}
      style={
        item.pinned
          ? { boxShadow: `inset 2px 0 0 0 ${PIN}, 0 1px 2px rgb(0 0 0 / 0.04)` }
          : undefined
      }
    >
      {isBulkMode && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={(c) => onSelectChange?.(item.id, c === true)}
          className="shrink-0"
          aria-label={`Select item: ${item.subject ?? 'Untitled'}`}
        />
      )}

      {/* Media — 40px */}
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
        {isDone && item.thumbnail_url ? (
          <Image
            src={item.thumbnail_url}
            alt={item.subject ?? ''}
            fill
            className="object-cover"
            sizes="40px"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ backgroundColor: `hsl(${placeholderHsl} / 0.12)` }}
          >
            <FileText size={16} style={{ color: `hsl(${placeholderHsl})` }} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Title row: dot + title */}
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: SOURCE_DOT[item.source_type ?? 'default'] }}
            aria-hidden="true"
          />
          <h3 className="truncate text-sm font-semibold leading-snug text-foreground">
            {item.subject ?? '(No subject)'}
          </h3>
        </div>

        {/* Meta row: domain · read time · tag */}
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{sourceLabel(item)}</span>
          {readMin && (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex shrink-0 items-center gap-1">
                <Clock size={11} />
                {readMin} min read
              </span>
            </>
          )}
          {firstTag && (
            <span
              className="ml-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none"
              style={{
                backgroundColor: `hsl(${tagHsl} / 0.12)`,
                color: `hsl(${tagHsl})`,
              }}
            >
              #{firstTag.name}
            </span>
          )}
        </div>
      </div>
    </article>
  )

  if (isDone && !isBulkMode) {
    return (
      <Link href={`/items/${item.id}`} className="block">
        {row}
      </Link>
    )
  }
  return row
}

export function CompactListLayout({
  items,
  isBulkMode = false,
  selectedIds,
  onSelectChange,
}: CompactListLayoutProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <CompactRow
          key={item.id}
          item={item}
          isBulkMode={isBulkMode}
          isSelected={selectedIds?.has(item.id) ?? false}
          onSelectChange={onSelectChange}
        />
      ))}
    </div>
  )
}
