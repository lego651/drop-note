import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { groupItemsByDate } from '../items'

const base = { ai_summary: null, status: 'done', error_message: null, pinned: false, source_type: null, source_url: null, thumbnail_url: null }

describe('groupItemsByDate', () => {
  it('returns empty array for empty input', () => {
    expect(groupItemsByDate([])).toEqual([])
  })

  it('groups items on the same day', () => {
    const items = [
      { ...base, id: '1', created_at: '2026-01-15T10:00:00Z', subject: 'a', sender_email: 'x@x.com' },
      { ...base, id: '2', created_at: '2026-01-15T14:00:00Z', subject: 'b', sender_email: 'x@x.com' },
    ]
    const groups = groupItemsByDate(items)
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(2)
  })

  it('groups items on two different days', () => {
    const items = [
      { ...base, id: '1', created_at: '2026-01-15T10:00:00Z', subject: 'a', sender_email: 'x@x.com' },
      { ...base, id: '2', created_at: '2026-01-16T10:00:00Z', subject: 'b', sender_email: 'x@x.com' },
    ]
    const groups = groupItemsByDate(items)
    expect(groups).toHaveLength(2)
    // Most recent first
    expect(new Date(groups[0].date).toISOString().startsWith('2026-01-16')).toBe(true)
  })

  it('labels today and yesterday correctly', () => {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)

    const items = [
      { ...base, id: '1', created_at: now.toISOString(), subject: 'a', sender_email: 'x@x.com' },
      { ...base, id: '2', created_at: yesterday.toISOString(), subject: 'b', sender_email: 'x@x.com' },
    ]
    const groups = groupItemsByDate(items)
    expect(groups[0].label).toBe('Today')
    expect(groups[1].label).toBe('Yesterday')
  })

  it('sorts most recent date first across multiple days', () => {
    const items = [
      { ...base, id: '1', created_at: '2026-01-10T00:00:00Z', subject: 'oldest', sender_email: 'x@x.com' },
      { ...base, id: '2', created_at: '2026-01-20T00:00:00Z', subject: 'newest', sender_email: 'x@x.com' },
      { ...base, id: '3', created_at: '2026-01-15T00:00:00Z', subject: 'middle', sender_email: 'x@x.com' },
    ]
    const groups = groupItemsByDate(items)
    expect(groups).toHaveLength(3)
    expect(groups[0].items[0].subject).toBe('newest')
    expect(groups[2].items[0].subject).toBe('oldest')
  })

  it('uses formatted date label for older items', () => {
    const items = [
      { ...base, id: '1', created_at: '2026-01-05T12:00:00Z', subject: 'old', sender_email: 'x@x.com' },
    ]
    const groups = groupItemsByDate(items)
    expect(groups[0].label).toBe('05 January 2026')
  })
})
