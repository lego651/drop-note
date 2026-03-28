'use client'

import type { CSSProperties } from 'react'

interface TagRowProps {
  tags: { id: string; name: string }[]
}

export function TagRow({ tags }: TagRowProps) {
  if (tags.length === 0) return <div className="flex-1" />

  return (
    <div
      className="no-scrollbar flex items-center gap-1 overflow-x-auto flex-nowrap flex-1 min-w-0"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as CSSProperties}
    >
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="shrink-0 rounded-md border border-border bg-secondary text-secondary-foreground text-xs py-0 px-1.5 leading-5"
        >
          {tag.name}
        </span>
      ))}
    </div>
  )
}
