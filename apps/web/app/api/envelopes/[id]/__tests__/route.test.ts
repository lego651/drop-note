import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, from } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}))

import { PATCH } from '../route'

const ENVELOPE_ID = '11111111-1111-1111-1111-111111111111'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/envelopes/${ENVELOPE_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function callPatch(body: unknown) {
  return PATCH(makeRequest(body), { params: Promise.resolve({ id: ENVELOPE_ID }) })
}

const CHECKLIST_BODY = {
  sections: [
    {
      type: 'checklist',
      items: [
        { text: 'Pack boots', sourceItemIds: ['item-2'], confidence: 'from_item' },
        { text: 'Pack tent', sourceItemIds: [], confidence: 'suggested' },
      ],
    },
    {
      type: 'notes',
      items: [{ text: 'A note', sourceItemIds: [], confidence: 'suggested' }],
    },
  ],
}

// Chainable Supabase mock for the `envelopes` table: select/eq/single resolve
// to `envelopeRow`, update captures what was written.
type EnvelopeRow = { id: string; status: string; body: unknown } | null
function makeFrom(envelopeRow: EnvelopeRow, updates: unknown[], updateError: unknown = null) {
  return vi.fn((table: string) => {
    if (table !== 'envelopes') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {}
      for (const m of ['select', 'eq', 'update']) chain[m] = vi.fn(() => chain)
      chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }))
      chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(onFulfilled)
      return chain
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.single = vi.fn(() => Promise.resolve({ data: envelopeRow, error: null }))
    chain.update = vi.fn((row: unknown) => {
      updates.push(row)
      return chain
    })
    chain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: updateError }).then(onFulfilled)
    return chain
  })
}

beforeEach(() => {
  getUser.mockReset()
  from.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('PATCH /api/envelopes/[id] — auth + validation', () => {
  it('401s when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0 })
    expect(res.status).toBe(401)
  })

  it('400s on an unknown action', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'delete', sectionIndex: 0, itemIndex: 0 })
    expect(res.status).toBe(400)
  })

  it('400s on a non-numeric sectionIndex', async () => {
    const res = await callPatch({ action: 'toggle', sectionIndex: 'zero', itemIndex: 0 })
    expect(res.status).toBe(400)
  })

  it('400s on empty edit text', async () => {
    const res = await callPatch({ action: 'edit', sectionIndex: 0, itemIndex: 0, text: '   ' })
    expect(res.status).toBe(400)
  })

  it('400s on edit text over the length cap', async () => {
    const res = await callPatch({ action: 'edit', sectionIndex: 0, itemIndex: 0, text: 'a'.repeat(501) })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/envelopes/[id] — ownership', () => {
  it('404s when the envelope does not belong to the caller (RLS / explicit user_id filter returns no row)', async () => {
    // User B's PATCH on user A's envelope: the authenticated-client select,
    // scoped by both RLS and the explicit .eq('user_id', ...), finds nothing.
    from.mockImplementation(makeFrom(null, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0 })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/envelopes/[id] — status gate', () => {
  it('409s when the envelope is still generating', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'generating', body: null }, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0 })
    expect(res.status).toBe(409)
  })

  it('409s when the envelope failed', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'failed', body: null }, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0 })
    expect(res.status).toBe(409)
  })
})

describe('PATCH /api/envelopes/[id] — toggle', () => {
  it('toggles a checklist leaf\'s checked state and persists the updated body', async () => {
    const updates: unknown[] = []
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, updates))

    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0 })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.body.sections[0].items[0].checked).toBe(true)
    expect(json.body.sections[0].items[1].checked).toBeUndefined()

    expect(updates).toHaveLength(1)
    expect((updates[0] as { body: { sections: { items: { checked?: boolean }[] }[] } }).body.sections[0].items[0].checked).toBe(true)
  })

  it('round-trips: toggling twice returns the leaf to unchecked', async () => {
    const updates: unknown[] = []
    const row = { id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }
    from.mockImplementation(makeFrom(row, updates))

    const first = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0 })
    const firstBody = (await first.json()).body

    // Simulate the row being reloaded with the persisted state (as a real PATCH → reload would see).
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: firstBody }, updates))
    const second = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0 })
    const secondBody = (await second.json()).body

    expect(secondBody.sections[0].items[0].checked).toBe(false)
  })

  it('400s when toggling a non-checklist (notes) leaf', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 1, itemIndex: 0 })
    expect(res.status).toBe(400)
  })

  it('400s on an out-of-range itemIndex', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 99 })
    expect(res.status).toBe(400)
  })

  it('500s when the DB update fails', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, [], new Error('db down')))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0 })
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/envelopes/[id] — edit', () => {
  it('edits a leaf\'s text, marks it edited, and leaves the citation untouched in storage', async () => {
    const updates: unknown[] = []
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, updates))

    const res = await callPatch({ action: 'edit', sectionIndex: 0, itemIndex: 0, text: '  New boots  ' })
    expect(res.status).toBe(200)

    const json = await res.json()
    const leaf = json.body.sections[0].items[0]
    expect(leaf.text).toBe('New boots')
    expect(leaf.edited).toBe(true)
    expect(leaf.sourceItemIds).toEqual(['item-2'])
  })

  it('works on a notes leaf too (not just checklist)', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'edit', sectionIndex: 1, itemIndex: 0, text: 'Edited note' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.body.sections[1].items[0].text).toBe('Edited note')
  })

  it('400s on a table sectionIndex (tables are not editable, DRO-196)', async () => {
    const bodyWithTable = {
      sections: [...CHECKLIST_BODY.sections, { type: 'table', columns: ['a'], rows: [[{ text: 'x', sourceItemIds: [], confidence: 'suggested' }]] }],
    }
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: bodyWithTable }, []))
    const res = await callPatch({ action: 'edit', sectionIndex: 2, itemIndex: 0, text: 'x' })
    expect(res.status).toBe(400)
  })
})
