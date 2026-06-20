'use client'

import { FolderPlus, Check } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface AddToFolderMenuProps {
  folders: { id: string; name: string }[]
  selectedIds: Set<string>
  onToggle: (folderId: string, nextInFolder: boolean) => void
  triggerClassName?: string
}

export function AddToFolderMenu({
  folders,
  selectedIds,
  onToggle,
  triggerClassName,
}: AddToFolderMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Add to folder"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground',
            triggerClassName,
          )}
        >
          <FolderPlus size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-52 p-1"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Add to folder</p>
        {folders.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No folders yet</p>
        ) : (
          <div className="max-h-60 overflow-y-auto">
            {folders.map((f) => {
              const inFolder = selectedIds.has(f.id)
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onToggle(f.id, !inFolder)
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
                >
                  <span className="flex-1 truncate text-left">{f.name}</span>
                  {inFolder && <Check size={14} className="shrink-0 text-foreground" />}
                </button>
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
