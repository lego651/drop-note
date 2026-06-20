import { ListCard } from '@/components/items/ListCard'
import type { ItemSummary } from '@/lib/items'

interface ItemsListLayoutProps {
  items: ItemSummary[]
  isBulkMode?: boolean
  selectedIds?: Set<string>
  onSelectChange?: (id: string, checked: boolean) => void
  onPinChange?: (id: string, pinned: boolean) => void
  onDelete?: (id: string) => void
  folders?: { id: string; name: string }[]
  onFolderToggle?: (itemId: string, folderId: string, nextInFolder: boolean) => void
}

export function ItemsListLayout({
  items,
  isBulkMode = false,
  selectedIds,
  onSelectChange,
  onPinChange,
  onDelete,
  folders,
  onFolderToggle,
}: ItemsListLayoutProps) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <ListCard
          key={item.id}
          item={item}
          isBulkMode={isBulkMode}
          isSelected={selectedIds?.has(item.id) ?? false}
          onSelectChange={onSelectChange}
          onPinChange={onPinChange}
          onDelete={onDelete}
          folders={folders}
          onFolderToggle={onFolderToggle}
        />
      ))}
    </div>
  )
}
