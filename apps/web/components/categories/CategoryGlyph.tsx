import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { colorForCategoryHsl, categoryGlyph } from '@/lib/design-tokens'

interface CategoryGlyphProps {
  category: { name: string; position: number; is_other: boolean }
  /** Active (selected sidebar row): solid fill instead of a tinted ring. */
  active?: boolean
  /** Pixel size of the swatch. Sidebar/picker rows use 22. */
  size?: number
  /** 0–1 opacity, used for hidden rows (60%). */
  opacity?: number
  className?: string
}

/** The 22px glyph swatch used in the sidebar, picker rows, and item detail. */
export function CategoryGlyph({ category, active = false, size = 22, opacity, className }: CategoryGlyphProps) {
  const hsl = colorForCategoryHsl(category)
  const glyph = categoryGlyph(category.name)

  const style: CSSProperties = {
    width: size,
    height: size,
    opacity,
    color: active ? 'hsl(var(--card))' : `hsl(${hsl})`,
    backgroundColor: active ? `hsl(${hsl})` : `hsl(${hsl} / 0.10)`,
    boxShadow: active ? undefined : `inset 0 0 0 1.5px hsl(${hsl})`,
  }

  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md text-[12px] font-extrabold',
        className,
      )}
    >
      {glyph}
    </span>
  )
}
