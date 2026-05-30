'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SlidersHorizontal, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SourceFilter = 'all' | 'email' | 'url' | 'youtube'

export const SOURCE_LABELS: Record<SourceFilter, string> = {
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
  const [isPending, startTransition] = useTransition()

  function handleSelect(source: SourceFilter) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    if (source === 'all') {
      params.delete('source') // default — keep URL clean
    } else {
      params.set('source', source)
    }
    const qs = params.toString()
    startTransition(() => router.push(`/items${qs ? `?${qs}` : ''}`))
    setOpen(false)
  }

  const isActive = activeSource !== 'all'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={isPending}
          className={cn(
            'h-11 shrink-0 gap-2 rounded-full border-border px-5 text-sm font-normal',
            isActive && 'bg-foreground text-background border-foreground',
            isPending && 'opacity-50',
          )}
        >
          <SlidersHorizontal
            size={15}
            className={cn(isActive ? 'text-background' : 'text-muted-foreground')}
          />
          {isActive ? SOURCE_LABELS[activeSource] : 'Filters'}
          {isActive && (
            <X
              size={14}
              className="text-background/70 hover:text-background"
              onClick={(e) => {
                e.stopPropagation()
                handleSelect('all')
              }}
            />
          )}
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
