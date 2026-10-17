'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronRight, EyeOff, Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { NavLink, ROW_ACTIVE, ROW_BASE, ROW_INACTIVE, COUNT } from '@/components/layout/sidebar-ui'
import { CategoryGlyph } from '@/components/categories/CategoryGlyph'
import { CategoryRowMenu } from '@/components/layout/CategoryRowMenu'
import { ResortDialog } from '@/components/categories/ResortDialog'
import { DeleteCategoryDialog } from '@/components/categories/DeleteCategoryDialog'
import { toast } from '@/hooks/use-toast'
import { sortCategoriesForDisplay, CATEGORY_CAP, CATEGORY_NAME_MAX_LENGTH } from '@/lib/category-display'
import type { CategoryLite } from '@/lib/category-display'

export type CategoryWithCount = CategoryLite & { item_count: number }

interface CategoryNavProps {
  categories: CategoryWithCount[]
  categoriesError?: boolean
  activeCategoryId: string | null
  collapsed?: boolean
  insideSheet?: boolean
}

export function CategoryNav({
  categories,
  categoriesError = false,
  activeCategoryId,
  collapsed = false,
  insideSheet = false,
}: CategoryNavProps) {
  const router = useRouter()
  const [items, setItems] = useState<CategoryWithCount[]>(categories)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [pendingCreateName, setPendingCreateName] = useState<string | null>(null)
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CategoryWithCount | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resortTarget, setResortTarget] = useState<CategoryWithCount | null>(null)

  useEffect(() => {
    setItems(categories)
  }, [categories])

  const visible = sortCategoriesForDisplay(items.filter((c) => !c.hidden))
  const hidden = sortCategoriesForDisplay(items.filter((c) => c.hidden))
  const atCap = items.length >= CATEGORY_CAP
  const menuAlign = insideSheet ? 'end' : 'start'
  const menuSide = insideSheet ? 'bottom' : 'right'

  function duplicateNameError(trimmed: string, excludeId?: string): string | null {
    const dup = items.some(
      (c) => c.id !== excludeId && c.name.toLowerCase() === trimmed.toLowerCase(),
    )
    return dup ? `You already have a category called “${trimmed}”.` : null
  }

  async function submitRename(category: CategoryWithCount, trimmed: string) {
    const prevName = category.name
    setItems((prev) => prev.map((c) => (c.id === category.id ? { ...c, name: trimmed } : c)))
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to rename category')
      }
      router.refresh()
    } catch (err) {
      setItems((prev) => prev.map((c) => (c.id === category.id ? { ...c, name: prevName } : c)))
      toast({
        title: `Couldn't rename “${prevName}”`,
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  async function toggleHidden(category: CategoryWithCount) {
    const nextHidden = !category.hidden
    setItems((prev) => prev.map((c) => (c.id === category.id ? { ...c, hidden: nextHidden } : c)))
    if (nextHidden) setHiddenOpen(true)
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: nextHidden }),
      })
      if (!res.ok) throw new Error()
      toast({
        title: nextHidden
          ? `“${category.name}” is hidden. Its items stay put; new items won’t be filed here.`
          : `“${category.name}” is back in your list.`,
      })
    } catch {
      setItems((prev) => prev.map((c) => (c.id === category.id ? { ...c, hidden: !nextHidden } : c)))
      toast({
        title: nextHidden
          ? `Couldn't hide “${category.name}”`
          : `Couldn't unhide “${category.name}”`,
        variant: 'destructive',
      })
    }
  }

  async function submitCreate(trimmed: string) {
    setPendingCreateName(trimmed)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Couldn't create “${trimmed}”`)
      const created: CategoryWithCount = { ...data, item_count: 0 }
      setItems((prev) => [...prev, created])
      setPendingCreateName(null)
      setResortTarget(created)
      router.refresh()
    } catch (err) {
      setPendingCreateName(null)
      toast({
        title: `Couldn't create “${trimmed}”`,
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  // The sidebar's item_count is scoped to active, non-archived email_body items
  // (for the badge), but deleteCategory reassigns every item with this category_id.
  // Open the dialog immediately with the sidebar count, then correct it in place
  // once the real deletion-scope count comes back, so the confirmation doesn't
  // understate how many items are affected.
  function handleDeleteRequest(category: CategoryWithCount) {
    setDeleteTarget(category)
    fetch(`/api/categories/${category.id}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ item_count?: number }>) : null))
      .then((data) => {
        if (typeof data?.item_count !== 'number') return
        setDeleteTarget((prev) =>
          prev && prev.id === category.id ? { ...prev, item_count: data.item_count! } : prev,
        )
      })
      .catch(() => {
        // Best-effort correction; keep the sidebar's count if the lookup fails.
      })
  }

  function handleDeleted(category: CategoryWithCount) {
    setItems((prev) => prev.filter((c) => c.id !== category.id))
    setDeleteTarget(null)
    setDeletingId(null)
    if (activeCategoryId === category.id) router.replace('/items')
    router.refresh()
  }

  function renderRow(category: CategoryWithCount, hiddenRow: boolean) {
    const active = activeCategoryId === category.id

    if (renamingId === category.id) {
      return (
        <CategoryInlineForm
          initialValue={category.name}
          currentName={category.name}
          ariaLabel="Rename category"
          glyphPreview={category}
          validate={(trimmed) => {
            if (!trimmed) return "Name can't be empty."
            return duplicateNameError(trimmed, category.id)
          }}
          onCommit={(trimmed) => {
            setRenamingId(null)
            submitRename(category, trimmed)
          }}
          onCancel={() => setRenamingId(null)}
        />
      )
    }

    return (
      <>
        <NavLink
          insideSheet={insideSheet}
          href={`/items?category=${category.id}`}
          aria-current={active ? 'page' : undefined}
          aria-label={
            hiddenRow
              ? `${category.name} (hidden), ${category.item_count} items`
              : undefined
          }
          title={category.name}
          className={cn(
            ROW_BASE,
            'min-h-9 py-1.5 pr-10',
            active ? ROW_ACTIVE : ROW_INACTIVE,
            hiddenRow && 'text-muted-foreground',
          )}
        >
          <CategoryGlyph category={category} active={active} opacity={hiddenRow ? 0.6 : undefined} />
          <span className="flex-1 truncate">{category.name}</span>
          {hiddenRow && <EyeOff size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className={cn(COUNT, active && 'border-ink text-foreground')}>{category.item_count}</span>
        </NavLink>
        <CategoryRowMenu
          category={category}
          align={menuAlign}
          side={menuSide}
          onRename={() => setRenamingId(category.id)}
          onToggleHidden={() => toggleHidden(category)}
          onDeleteRequest={() => handleDeleteRequest(category)}
        />
      </>
    )
  }

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {categoriesError ? null : (
          <ul role="list" aria-label="Categories" className="space-y-0.5">
            {visible.map((c) => {
              const active = activeCategoryId === c.id
              return (
                <li key={c.id}>
                  <NavLink
                    insideSheet={insideSheet}
                    href={`/items?category=${c.id}`}
                    title={c.name}
                    aria-label={`${c.name}, ${c.item_count} items`}
                    className={cn(ROW_BASE, 'justify-center px-0', active ? ROW_ACTIVE : ROW_INACTIVE)}
                  >
                    <CategoryGlyph category={c} active={active} />
                  </NavLink>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between px-3 pb-1.5">
        <p className="type-label text-foreground">Categories</p>
        <span
          className={cn('font-mono text-[11px] tabular-nums text-muted-foreground', atCap && 'text-foreground')}
          aria-label={`${items.length} of ${CATEGORY_CAP} categories used`}
        >
          {items.length}/{CATEGORY_CAP}
        </span>
      </div>

      {categoriesError ? (
        <div className="space-y-2 px-3">
          <div
            className="flex items-start gap-2 rounded-[10px] border-stroke px-3 py-2.5"
            style={{
              backgroundColor: 'hsl(var(--destructive) / 0.08)',
              borderColor: 'hsl(var(--destructive) / 0.45)',
            }}
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive-text" aria-hidden="true" />
            <p className="text-sm text-foreground">Couldn&apos;t load categories.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
            Retry
          </Button>
        </div>
      ) : (
        <ul role="list" aria-label="Categories" className="space-y-0.5">
          {visible.map((c) => (
            <li key={c.id} className={cn('group relative', deletingId === c.id && 'pointer-events-none opacity-60')}>
              {renderRow(c, false)}
            </li>
          ))}

          <li>
            {isCreating ? (
              <CategoryInlineForm
                initialValue=""
                ariaLabel="Category name"
                placeholder="Category name"
                validate={(trimmed) => {
                  if (!trimmed) return "Name can't be empty."
                  return duplicateNameError(trimmed)
                }}
                onCommit={(trimmed) => {
                  setIsCreating(false)
                  submitCreate(trimmed)
                }}
                onCancel={() => setIsCreating(false)}
              />
            ) : pendingCreateName ? (
              <div className={cn(ROW_BASE, 'py-1.5 opacity-60')}>
                <span
                  aria-hidden="true"
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-stroke border-dashed border-ink/40 text-[12px] text-muted-foreground"
                >
                  +
                </span>
                <span className="flex-1 truncate">{pendingCreateName}</span>
                <Loader2 size={13} className="shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  aria-disabled={atCap}
                  aria-describedby={atCap ? 'category-cap-note' : undefined}
                  onClick={() => {
                    if (!atCap) setIsCreating(true)
                  }}
                  className={cn(
                    ROW_BASE,
                    ROW_INACTIVE,
                    'w-full py-1.5 text-left text-muted-foreground',
                    atCap && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-stroke border-dashed border-ink/40">
                    <Plus size={15} aria-hidden="true" />
                  </span>
                  <span className="flex-1 truncate">New category</span>
                </button>
                {atCap && (
                  <p id="category-cap-note" className="px-3 text-xs text-muted-foreground">
                    You&apos;ve reached 15 categories, hidden ones included. Delete one to add another.
                  </p>
                )}
              </>
            )}
          </li>

          {hidden.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setHiddenOpen((v) => !v)}
                aria-expanded={hiddenOpen}
                className={cn(ROW_BASE, ROW_INACTIVE, 'w-full py-1.5 text-left text-muted-foreground')}
              >
                <ChevronRight
                  size={15}
                  className={cn('shrink-0 transition-transform', hiddenOpen && 'rotate-90')}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">Hidden ({hidden.length})</span>
              </button>
              {hiddenOpen && (
                <ul role="list" aria-label="Hidden categories" className="space-y-0.5">
                  {hidden.map((c) => (
                    <li
                      key={c.id}
                      className={cn('group relative', deletingId === c.id && 'pointer-events-none opacity-60')}
                    >
                      {renderRow(c, true)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}
        </ul>
      )}

      {deleteTarget && (
        <DeleteCategoryDialog
          open
          category={deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onDeleted={() => handleDeleted(deleteTarget)}
          onPendingChange={(pending) => setDeletingId(pending ? deleteTarget.id : null)}
        />
      )}
      {resortTarget && (
        <ResortDialog
          open
          category={resortTarget}
          categories={items}
          onOpenChange={(open) => !open && setResortTarget(null)}
          onApplied={() => router.refresh()}
        />
      )}
    </div>
  )
}

interface CategoryInlineFormProps {
  initialValue: string
  /** For rename: the unchanged value closes the form without a request. Omit for create. */
  currentName?: string
  validate: (trimmed: string) => string | null
  onCommit: (trimmed: string) => void
  onCancel: () => void
  placeholder?: string
  ariaLabel: string
  glyphPreview?: { position: number; is_other: boolean }
}

function CategoryInlineForm({
  initialValue,
  currentName,
  validate,
  onCommit,
  onCancel,
  placeholder,
  ariaLabel,
  glyphPreview,
}: CategoryInlineFormProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const settledRef = useRef(false)
  const errorId = `${ariaLabel.replace(/\s+/g, '-').toLowerCase()}-error`

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function attempt(onInvalid: 'show' | 'cancel') {
    if (settledRef.current) return
    const trimmed = value.trim()
    if (currentName !== undefined && trimmed === currentName) {
      settledRef.current = true
      onCancel()
      return
    }
    const err = validate(trimmed)
    if (err) {
      if (onInvalid === 'show') {
        setError(err)
      } else {
        settledRef.current = true
        onCancel()
      }
      return
    }
    settledRef.current = true
    onCommit(trimmed)
  }

  return (
    <div className="flex items-start gap-3 px-3 py-1.5">
      {glyphPreview ? (
        <CategoryGlyph category={{ ...glyphPreview, name: value || '?' }} />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-stroke border-dashed border-ink/40 text-[12px] text-muted-foreground"
        >
          +
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="relative">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                attempt('show')
              } else if (e.key === 'Escape') {
                e.preventDefault()
                settledRef.current = true
                onCancel()
              }
            }}
            onBlur={() => attempt('cancel')}
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            placeholder={placeholder}
            aria-label={ariaLabel}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className="h-9 pr-12"
          />
          {value.length > 30 && (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground">
              {value.length}/{CATEGORY_NAME_MAX_LENGTH}
            </span>
          )}
        </div>
        {error && (
          <p id={errorId} className="text-xs text-destructive-text">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
