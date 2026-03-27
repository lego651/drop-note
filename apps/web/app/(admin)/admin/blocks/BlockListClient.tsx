'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'

interface BlockEntry {
  id: string
  type: string
  value: string
  created_at: string | null
  created_by: string | null
}

interface BlockListClientProps {
  initialBlocks: BlockEntry[]
}

export function BlockListClient({ initialBlocks }: BlockListClientProps) {
  const [blocks, setBlocks] = useState(initialBlocks)
  const [type, setType] = useState<'email' | 'ip'>('email')
  const [value, setValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setAddError('')

    const res = await fetch('/api/admin/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, value: value.trim() }),
    })

    const data = await res.json()
    setAdding(false)

    if (!res.ok) {
      setAddError(data.error ?? 'Failed to add block entry')
      return
    }

    setBlocks((prev) => [data.block, ...prev])
    setValue('')
  }

  async function handleRemove(id: string) {
    const res = await fetch(`/api/admin/blocks/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setBlocks((prev) => prev.filter((b) => b.id !== id))
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to remove block entry')
    }
  }

  return (
    <div className="space-y-4">
      {/* Add entry form */}
      <form onSubmit={handleAdd} className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'email' | 'ip')}
            className="rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="email">Email</option>
            <option value="ip">IP</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground">Value</label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type === 'email' ? 'spam@example.com' : '1.2.3.4'}
            required
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Button type="submit" size="sm" disabled={adding}>
          {adding ? 'Adding\u2026' : 'Add block'}
        </Button>
        {addError && <p className="w-full text-xs text-destructive">{addError}</p>}
      </form>

      {/* Table */}
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Value</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Added</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Source</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {blocks.map((b) => (
              <tr key={b.id} className="hover:bg-muted/30">
                <td className="px-4 py-2 capitalize">{b.type}</td>
                <td className="px-4 py-2 font-mono text-xs">{b.value}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {b.created_at ? format(new Date(b.created_at), 'MMM d, yyyy') : '\u2014'}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {b.created_by ? 'Admin' : 'Auto-blocked'}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => handleRemove(b.id)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {blocks.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No blocked entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
