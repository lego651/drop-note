'use client'

import { Folder, X } from 'lucide-react'

interface FolderPillsProps {
  folders: { id: string; name: string }[]
  onRemove?: (folderId: string) => void
}

export function FolderPills({ folders, onRemove }: FolderPillsProps) {
  if (folders.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      {folders.map((f) => (
        <span
          key={f.id}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          <Folder size={10} className="shrink-0" />
          {f.name}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove from ${f.name}`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onRemove(f.id)
              }}
              className="rounded hover:text-foreground"
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}
