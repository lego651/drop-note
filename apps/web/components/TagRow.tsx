'use client'

import { useRef, useLayoutEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'

interface TagRowProps {
  tags: { id: string; name: string }[]
}

export function TagRow({ tags }: TagRowProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(tags.length)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el || tags.length === 0) return

    function measure() {
      if (!el) return
      const containerW = el.clientWidth
      if (containerW === 0) return

      const items = el.querySelectorAll<HTMLElement>('[data-tag-item]')

      // Temporarily un-hide all items so offsetWidth is correct
      items.forEach((item) => (item.style.display = ''))

      // Estimate overflow badge width using the widest plausible text ("+99")
      // We approximate: same padding as a badge, ~28px for "+9"
      const OVERFLOW_W = 28 + 4 // badge width + gap

      const GAP = 4
      let used = 0
      let count = 0

      for (let i = 0; i < items.length; i++) {
        const w = items[i].offsetWidth + GAP
        const isLast = i === items.length - 1
        const wouldNeedOverflow = !isLast // if we stop before the last, we need "+N"
        const reserve = wouldNeedOverflow ? OVERFLOW_W : 0
        if (used + w + reserve > containerW) break
        used += w
        count = i + 1
      }

      setVisibleCount((prev) => (prev === count ? prev : count))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tags])

  const extra = tags.length - visibleCount

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1 overflow-hidden min-w-0 flex-1"
    >
      {tags.map((tag, i) => (
        <Badge
          key={tag.id}
          data-tag-item=""
          variant="secondary"
          className="text-xs py-0 px-1.5 shrink-0"
          style={i >= visibleCount ? { display: 'none' } : undefined}
        >
          {tag.name}
        </Badge>
      ))}
      {extra > 0 && (
        <Badge variant="secondary" className="text-xs py-0 px-1.5 shrink-0">
          +{extra}
        </Badge>
      )}
    </div>
  )
}
