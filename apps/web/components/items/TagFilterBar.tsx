'use client'

import { useState, useTransition } from 'react'
import type { CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { colorForTag } from '@/lib/design-tokens'

// Filter chips (AIRMAIL § 7): ink outline, active = cobalt + small ink shadow.
const CHIP =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border-stroke border-ink px-3 text-sm font-semibold transition-colors'
const CHIP_ACTIVE = 'bg-primary text-primary-foreground shadow-ink-sm'
const CHIP_INACTIVE = 'bg-card text-foreground hover:bg-accent'

// `tags` arrives ordered by item_count desc — the first N are already the
// most-used ones, so this cap doubles as "top tags" without re-sorting.
const TAGS_SHOWN_BY_DEFAULT = 8

interface TagFilterBarProps {
  tags: { id: string; name: string; count: number }[]
  totalCount: number
  activeTagId?: string
}

export function TagFilterBar({ tags, totalCount, activeTagId }: TagFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [showAllTags, setShowAllTags] = useState(false)

  function handleTagClick(tagId: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    if (tagId === null || tagId === activeTagId) {
      params.delete('tag')
    } else {
      params.set('tag', tagId)
    }
    const qs = params.toString()
    startTransition(() => router.push(`/items${qs ? `?${qs}` : ''}`))
  }

  const isAllActive = !activeTagId

  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto pb-1.5 pr-1',
        isPending && 'pointer-events-none opacity-60',
      )}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as CSSProperties}
    >
      {/* All pill */}
      <button
        type="button"
        onClick={() => handleTagClick(null)}
        className={cn(
          CHIP,
          isAllActive ? CHIP_ACTIVE : CHIP_INACTIVE,
        )}
      >
        All <span className="font-mono text-[11px] font-normal opacity-70">{totalCount}</span>
      </button>

      {(showAllTags ? tags : tags.slice(0, TAGS_SHOWN_BY_DEFAULT)).map((tag) => {
        const isActive = activeTagId === tag.id
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => handleTagClick(tag.id)}
            className={cn(
              CHIP,
              isActive ? CHIP_ACTIVE : CHIP_INACTIVE,
            )}
          >
            <span style={isActive ? undefined : { color: `hsl(${colorForTag(tag.name)})` }}>#</span>
            {tag.name}
            <span className="font-mono text-[11px] font-normal opacity-70">{tag.count}</span>
          </button>
        )
      })}

      {tags.length > TAGS_SHOWN_BY_DEFAULT && (
        <button
          type="button"
          onClick={() => setShowAllTags((prev) => !prev)}
          className={cn(CHIP, CHIP_INACTIVE, 'text-muted-foreground')}
        >
          {showAllTags ? 'Show less' : `Show all (${tags.length})`}
        </button>
      )}
    </div>
  )
}
