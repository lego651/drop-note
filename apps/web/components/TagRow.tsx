'use client'

import type { CSSProperties } from 'react'
import { colorForTagHsl } from '@/lib/design-tokens'

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
      {tags.map((tag) => {
        const hsl = colorForTagHsl(tag.name)
        return (
          <span
            key={tag.id}
            className="shrink-0 rounded-full border text-[11px] py-[3px] px-1.5 leading-none font-semibold"
            style={{
              backgroundColor: `hsl(${hsl} / 0.08)`,
              borderColor: `hsl(${hsl} / 0.45)`,
              color: `hsl(${hsl})`,
            }}
          >
            #{tag.name}
          </span>
        )
      })}
    </div>
  )
}
