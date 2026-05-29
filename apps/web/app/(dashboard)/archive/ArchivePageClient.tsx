'use client'

import { useState, useCallback } from 'react'
import { Archive, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SOURCE_DOT } from '@/lib/design-tokens'

export interface ArchiveItem {
  id: string
  subject: string | null
  ai_summary: string | null
  created_at: string
  archived_at?: string | null
  source_type: string | null
}

interface ArchivePageClientProps {
  items: ArchiveItem[]
}

function compactAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${Math.max(m, 1)}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.floor(mo / 12)}y`
}

export function ArchivePageClient({ items: initialItems }: ArchivePageClientProps) {
  const [items, setItems] = useState(initialItems)

  const handleUnarchive = useCallback(async (id: string) => {
    await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    })
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Archive size={20} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold">Archive</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Items you&apos;ve archived. Unarchive to bring them back to your inbox.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Archive is empty.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                  style={{ backgroundColor: SOURCE_DOT[item.source_type ?? 'default'] }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.subject ?? '(No subject)'}
                  </p>
                  {item.ai_summary && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {item.ai_summary}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Archived {compactAge(item.archived_at ?? item.created_at)} ago
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 h-7 text-xs"
                onClick={() => handleUnarchive(item.id)}
              >
                <RotateCcw size={12} />
                Unarchive
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
