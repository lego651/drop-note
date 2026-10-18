'use client'

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { colorForCategoryHsl } from '@/lib/design-tokens'

export type BadgeCategory = { id: string; name: string; position: number; is_other: boolean }

interface CategoryBadgeProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  category: BadgeCategory
  size?: 'sm' | 'lg'
  /** Renders as an interactive button (dropdown trigger) instead of a static span. */
  interactive?: boolean
}

/**
 * Presentational category pill: swatch + name (+ chevron when interactive).
 * Static by default — wrap with `<DropdownMenuTrigger asChild>` and pass
 * `interactive` to use it as a picker trigger (see CategoryPicker).
 */
export const CategoryBadge = forwardRef<HTMLButtonElement, CategoryBadgeProps>(
  ({ category, size = 'sm', interactive = false, className, ...props }, ref) => {
    const hsl = colorForCategoryHsl(category)
    const vars = {
      '--cat-color': `hsl(${hsl})`,
      '--cat-bg': `hsl(${hsl} / 0.08)`,
      '--cat-bg-hover': `hsl(${hsl} / 0.14)`,
      '--cat-border': `hsl(${hsl} / 0.45)`,
    } as CSSProperties

    const shared = cn(
      'inline-flex max-w-full items-center gap-1.5 rounded-full border-stroke font-sans font-bold leading-none',
      'border-[var(--cat-border)] bg-[var(--cat-bg)] text-[var(--cat-color)]',
      size === 'lg' ? 'px-3.5 py-1.5 text-[13.5px]' : 'px-2.5 py-[3px] text-xs',
      className,
    )

    const swatch = (
      <span
        aria-hidden="true"
        className={cn('shrink-0 rounded-[3px] bg-[var(--cat-color)]', size === 'lg' ? 'h-3 w-3' : 'h-2.5 w-2.5')}
      />
    )

    if (!interactive) {
      return (
        <span style={vars} className={shared}>
          {swatch}
          <span className="truncate">{category.name}</span>
        </span>
      )
    }

    return (
      <button
        ref={ref}
        type="button"
        style={vars}
        aria-haspopup="menu"
        aria-label={`Category: ${category.name}. Change category`}
        className={cn(
          shared,
          'relative hover:bg-[var(--cat-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          "after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
        )}
        {...props}
      >
        {swatch}
        <span className="truncate">{category.name}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
    )
  },
)
CategoryBadge.displayName = 'CategoryBadge'
