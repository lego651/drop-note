'use client'

import type { CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

interface TagFilterBarProps {
  tags: { id: string; name: string; count: number }[]
  totalCount: number
  activeTagId?: string
}

export function TagFilterBar({ tags, totalCount, activeTagId }: TagFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleTagClick(tagId: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    if (tagId === null || tagId === activeTagId) {
      params.delete('tag')
    } else {
      params.set('tag', tagId)
    }
    const qs = params.toString()
    router.push(`/items${qs ? `?${qs}` : ''}`)
  }

  const isAllActive = !activeTagId

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as CSSProperties}
    >
      {/* All pill */}
      <button
        type="button"
        onClick={() => handleTagClick(null)}
        className={cn(
          'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors border',
          isAllActive
            ? 'bg-foreground text-background border-foreground'
            : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground',
        )}
      >
        All <span className="opacity-70">{totalCount}</span>
      </button>

      {tags.map((tag) => {
        const isActive = activeTagId === tag.id
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => handleTagClick(tag.id)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors border',
              isActive
                ? 'bg-foreground text-background border-foreground'
                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground',
            )}
          >
            # {tag.name} <span className="opacity-70">{tag.count}</span>
          </button>
        )
      })}
    </div>
  )
}
