'use client'

import { useState, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'

type Tag = { id: string; name: string }

interface ItemDetailEditorProps {
  itemId: string
  initialSummary: string
  initialNotes: string
  initialTags: Tag[]
  userTags: Tag[]
}

export function ItemDetailEditor({
  itemId,
  initialSummary,
  initialNotes,
  initialTags,
  userTags,
}: ItemDetailEditorProps) {
  const { toast } = useToast()
  const [summary, setSummary] = useState(initialSummary)
  const [notes, setNotes] = useState(initialNotes)
  const [tags, setTags] = useState<Tag[]>(initialTags)
  const [tagInput, setTagInput] = useState('')
  const [suggestions, setSuggestions] = useState<Tag[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [savingTag, setSavingTag] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  async function patchItem(updates: {
    ai_summary?: string
    notes?: string
    tags?: string[]
  }): Promise<{ item_tags?: { tags: Tag | null }[] }> {
    const res = await fetch(`/api/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) throw new Error('Failed to save')
    return res.json()
  }

  async function handleSummaryBlur() {
    try {
      await patchItem({ ai_summary: summary })
    } catch {
      toast({ title: 'Failed to save summary', variant: 'destructive' })
      setSummary(initialSummary)
    }
  }

  async function handleNotesBlur() {
    try {
      await patchItem({ notes })
    } catch {
      toast({ title: 'Failed to save notes', variant: 'destructive' })
      setNotes(initialNotes)
    }
  }

  async function applyTagChange(newTags: Tag[]) {
    const prevTags = tags
    setTags(newTags)
    try {
      const updated = await patchItem({ tags: newTags.map(t => t.name) })
      // Sync state with server response (gets proper IDs for new tags)
      const serverTags = (updated.item_tags ?? [])
        .map((it) => it.tags)
        .filter((t): t is Tag => t !== null)
      if (serverTags.length > 0) {
        setTags(serverTags)
      }
    } catch {
      toast({ title: 'Failed to update tags', variant: 'destructive' })
      setTags(prevTags)
    }
  }

  function handleTagInputChange(value: string) {
    setTagInput(value)
    setHighlightedIndex(-1)
    if (value.trim().length > 0) {
      const lower = value.toLowerCase()
      const filtered = userTags.filter(
        t =>
          t.name.toLowerCase().includes(lower) &&
          !tags.some(existing => existing.id === t.id)
      )
      setSuggestions(filtered.slice(0, 8))
    } else {
      setSuggestions([])
    }
  }

  async function addTagFromInput(nameOrTag: string | Tag) {
    const tag: Tag =
      typeof nameOrTag === 'string'
        ? { id: '', name: nameOrTag.trim() }
        : nameOrTag

    if (!tag.name) return
    if (tags.some(t => t.name.toLowerCase() === tag.name.toLowerCase())) {
      setTagInput('')
      setSuggestions([])
      setHighlightedIndex(-1)
      return
    }

    setTagInput('')
    setSuggestions([])
    setHighlightedIndex(-1)
    setSavingTag(true)
    try {
      await applyTagChange([...tags, tag])
    } finally {
      setSavingTag(false)
      tagInputRef.current?.focus()
    }
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Total selectable items: suggestions + optional "Create new" entry
    const hasCreateOption = tagInput.trim() &&
      !tags.some(t => t.name.toLowerCase() === tagInput.trim().toLowerCase()) &&
      !userTags.some(t => t.name.toLowerCase() === tagInput.trim().toLowerCase())
    const totalOptions = suggestions.length + (hasCreateOption ? 1 : 0)

    if (e.key === 'ArrowDown' && totalOptions > 0) {
      e.preventDefault()
      setHighlightedIndex(prev =>
        prev < totalOptions - 1 ? prev + 1 : 0
      )
    } else if (e.key === 'ArrowUp' && totalOptions > 0) {
      e.preventDefault()
      setHighlightedIndex(prev =>
        prev > 0 ? prev - 1 : totalOptions - 1
      )
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        addTagFromInput(suggestions[highlightedIndex])
      } else if (tagInput.trim()) {
        addTagFromInput(tagInput.trim())
      }
    } else if (e.key === 'Escape') {
      setSuggestions([])
      setHighlightedIndex(-1)
    }
  }

  async function removeTag(tagToRemove: Tag) {
    await applyTagChange(tags.filter(t => t.name !== tagToRemove.name))
  }

  function highlightMatch(text: string, query: string) {
    if (!query) return text
    const lower = text.toLowerCase()
    const idx = lower.indexOf(query.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <span className="font-semibold text-foreground">{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    )
  }

  // Check if the current input exactly matches an existing tag (already added)
  const inputMatchesExisting = tagInput.trim() &&
    tags.some(t => t.name.toLowerCase() === tagInput.trim().toLowerCase())
  // Check if input text would create a new tag (not in suggestions)
  const isNewTag = tagInput.trim() &&
    !inputMatchesExisting &&
    !userTags.some(t => t.name.toLowerCase() === tagInput.trim().toLowerCase())

  return (
    <div className="space-y-6">
      {/* AI Summary */}
      <div className="space-y-2">
        <label htmlFor="item-ai-summary" className="text-sm font-medium">AI Summary</label>
        <textarea
          id="item-ai-summary"
          className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          onBlur={handleSummaryBlur}
          placeholder="AI-generated summary..."
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label htmlFor="item-notes" className="text-sm font-medium">Notes</label>
        <textarea
          id="item-notes"
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Your notes..."
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <label htmlFor="item-tag-input" className="text-sm font-medium">Tags</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map(tag => (
            <span
              key={tag.name}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-muted-foreground hover:text-foreground ml-1 leading-none"
                aria-label={`Remove tag ${tag.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <div className="flex gap-2">
            <input
              ref={tagInputRef}
              id="item-tag-input"
              type="text"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Search or add tag..."
              value={tagInput}
              onChange={e => handleTagInputChange(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => setTimeout(() => {
                setSuggestions([])
                setHighlightedIndex(-1)
              }, 150)}
              onFocus={() => {
                if (tagInput.trim()) handleTagInputChange(tagInput)
              }}
              autoComplete="off"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!tagInput.trim() || !!inputMatchesExisting || savingTag}
              onClick={() => {
                if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
                  addTagFromInput(suggestions[highlightedIndex])
                } else if (tagInput.trim()) {
                  addTagFromInput(tagInput.trim())
                }
              }}
            >
              {savingTag ? 'Adding…' : 'Add'}
            </Button>
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-[calc(100%-4rem)] rounded-md border border-border bg-popover shadow-md max-h-60 overflow-y-auto">
              {suggestions.map((s, index) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm ${
                      index === highlightedIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent hover:text-accent-foreground'
                    }`}
                    onMouseDown={() => addTagFromInput(s)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {highlightMatch(s.name, tagInput)}
                  </button>
                </li>
              ))}
              {isNewTag && (
                <li>
                  <button
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm border-t border-border ${
                      highlightedIndex === suggestions.length
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent hover:text-accent-foreground'
                    }`}
                    onMouseDown={() => addTagFromInput(tagInput.trim())}
                    onMouseEnter={() => setHighlightedIndex(suggestions.length)}
                  >
                    Create &ldquo;<span className="font-medium">{tagInput.trim()}</span>&rdquo;
                  </button>
                </li>
              )}
            </ul>
          )}
          {tagInput.trim() && suggestions.length === 0 && !inputMatchesExisting && (
            <ul className="absolute z-10 mt-1 w-[calc(100%-4rem)] rounded-md border border-border bg-popover shadow-md">
              <li>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  onMouseDown={() => addTagFromInput(tagInput.trim())}
                >
                  Create &ldquo;<span className="font-medium">{tagInput.trim()}</span>&rdquo;
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
