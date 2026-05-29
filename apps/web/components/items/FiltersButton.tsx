'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SlidersHorizontal, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SourceFilter = 'all' | 'email' | 'url' | 'youtube'

const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'All sources',
  email: 'Email',
  url: 'Articles & links',
  youtube: 'Videos',
}

interface FiltersButtonProps {
  activeSource: SourceFilter
}

export function FiltersButton({ activeSource }: FiltersButtonProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)

  function handleSelect(source: SourceFilter) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    if (source === 'all') {
      params.delete('source') // default — keep URL clean
    } else {
      params.set('source', source)
    }
    const qs = params.toString()
    router.push(`/items${qs ? `?${qs}` : ''}`)
    setOpen(false)
  }

  const isActive = activeSource !== 'all'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-11 shrink-0 gap-2 rounded-full border-border px-5 text-sm font-normal',
            isActive && 'border-foreground',
          )}
        >
          <SlidersHorizontal size={15} className="text-muted-foreground" />
          Filters
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="end">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Source</p>
        {(Object.keys(SOURCE_LABELS) as SourceFilter[]).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => handleSelect(opt)}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              activeSource === opt ? 'font-medium' : 'text-muted-foreground',
            )}
          >
            <Check
              size={13}
              className={cn('shrink-0', activeSource === opt ? 'opacity-100' : 'opacity-0')}
            />
            {SOURCE_LABELS[opt]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
