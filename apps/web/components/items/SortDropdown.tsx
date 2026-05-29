'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowUpDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SortOption = 'newest' | 'oldest' | 'pinned'

const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  pinned: 'Pinned first',
}

interface SortDropdownProps {
  activeSort: SortOption
}

export function SortDropdown({ activeSort }: SortDropdownProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)

  function handleSort(sort: SortOption) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    if (sort === 'newest') {
      params.delete('sort') // default — keep URL clean
    } else {
      params.set('sort', sort)
    }
    const qs = params.toString()
    router.push(`/items${qs ? `?${qs}` : ''}`)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <ArrowUpDown size={13} />
          {SORT_LABELS[activeSort]}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="end">
        {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => handleSort(opt)}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              activeSort === opt ? 'font-medium' : 'text-muted-foreground',
            )}
          >
            <Check
              size={13}
              className={cn('shrink-0', activeSort === opt ? 'opacity-100' : 'opacity-0')}
            />
            {SORT_LABELS[opt]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
