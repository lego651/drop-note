'use client'

import { useState, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'

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
  const tagInputRef = useRef<HTMLInputElement>(null)

  async function patchItem(updates: {
    ai_summary?: string
    notes?: string
    tags?: string[]
  }) {
    const res = await fetch(`/api/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) throw new Error('Failed to save')
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
      await patchItem({ tags: newTags.map(t => t.name) })
    } catch {
      toast({ title: 'Failed to update tags', variant: 'destructive' })
      setTags(prevTags)
    }
  }

  function handleTagInputChange(value: string) {
    setTagInput(value)
    if (value.trim().length > 0) {
      const lower = value.toLowerCase()
      const filtered = userTags.filter(
        t =>
          t.name.toLowerCase().includes(lower) &&
          !tags.some(existing => existing.id === t.id)
      )
      setSuggestions(filtered.slice(0, 5))
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
      return
    }

    setTagInput('')
    setSuggestions([])
    await applyTagChange([...tags, tag])
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      addTagFromInput(tagInput.trim())
    }
  }

  async function removeTag(tagToRemove: Tag) {
    await applyTagChange(tags.filter(t => t.name !== tagToRemove.name))
  }

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
          <input
            ref={tagInputRef}
            id="item-tag-input"
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Add tag..."
            value={tagInput}
            onChange={e => handleTagInputChange(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
              {suggestions.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                    onMouseDown={() => addTagFromInput(s)}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
