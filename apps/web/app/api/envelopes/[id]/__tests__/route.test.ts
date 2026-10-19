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

  it('400s on a toggle with no "checked" boolean', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0 })
    expect(res.status).toBe(400)
  })

  it('400s on a toggle with a non-boolean "checked"', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0, checked: 'true' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/envelopes/[id] — ownership', () => {
  it('404s when the envelope does not belong to the caller (RLS / explicit user_id filter returns no row)', async () => {
    // User B's PATCH on user A's envelope: the authenticated-client select,
    // scoped by both RLS and the explicit .eq('user_id', ...), finds nothing.
    from.mockImplementation(makeFrom(null, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0, checked: true })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/envelopes/[id] — status gate', () => {
  it('409s when the envelope is still generating', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'generating', body: null }, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0, checked: true })
    expect(res.status).toBe(409)
  })

  it('409s when the envelope failed', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'failed', body: null }, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0, checked: true })
    expect(res.status).toBe(409)
  })
})

describe('PATCH /api/envelopes/[id] — toggle', () => {
  it('sets a checklist leaf\'s checked state (from the explicit "checked" value, not a flip) and persists the updated body', async () => {
    const updates: unknown[] = []
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, updates))

    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0, checked: true })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.body.sections[0].items[0].checked).toBe(true)
    expect(json.body.sections[0].items[1].checked).toBeUndefined()

    expect(updates).toHaveLength(1)
    expect((updates[0] as { body: { sections: { items: { checked?: boolean }[] }[] } }).body.sections[0].items[0].checked).toBe(true)
  })

  it('is idempotent: sending checked: true twice leaves the leaf checked (no flip-based double-toggle)', async () => {
    const updates: unknown[] = []
    const row = { id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }
    from.mockImplementation(makeFrom(row, updates))

    const first = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0, checked: true })
    const firstBody = (await first.json()).body
    expect(firstBody.sections[0].items[0].checked).toBe(true)

    // Simulate a retry/out-of-order redelivery of the same "checked: true" request
    // against the row as persisted after the first call.
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: firstBody }, updates))
    const second = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0, checked: true })
    const secondBody = (await second.json()).body

    expect(secondBody.sections[0].items[0].checked).toBe(true)
  })

  it('can set a leaf back to unchecked by sending checked: false', async () => {
    const updates: unknown[] = []
    const checkedBody = {
      sections: [
        { ...CHECKLIST_BODY.sections[0], items: [{ ...CHECKLIST_BODY.sections[0].items[0], checked: true }, CHECKLIST_BODY.sections[0].items[1]] },
        CHECKLIST_BODY.sections[1],
      ],
    }
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: checkedBody }, updates))

    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0, checked: false })
    const json = await res.json()
    expect(json.body.sections[0].items[0].checked).toBe(false)
  })

  it('400s when toggling a non-checklist (notes) leaf', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 1, itemIndex: 0, checked: true })
    expect(res.status).toBe(400)
  })

  it('400s on an out-of-range itemIndex', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 99, checked: true })
    expect(res.status).toBe(400)
  })

  it('500s when the DB update fails', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, [], new Error('db down')))
    const res = await callPatch({ action: 'toggle', sectionIndex: 0, itemIndex: 0, checked: true })
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

describe('PATCH /api/envelopes/[id] — addItem (DRO-232)', () => {
  it('appends a user leaf (no citation, origin: user) to a checklist section and persists it', async () => {
    const updates: unknown[] = []
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, updates))

    const res = await callPatch({ action: 'addItem', sectionIndex: 0, text: 'Pack sunscreen' })
    expect(res.status).toBe(200)

    const json = await res.json()
    const items = json.body.sections[0].items
    expect(items).toHaveLength(3)
    expect(items[2]).toEqual({ text: 'Pack sunscreen', sourceItemIds: [], confidence: 'suggested', origin: 'user' })
  })

  it('works on a notes section too', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'addItem', sectionIndex: 1, text: 'Another note' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.body.sections[1].items).toHaveLength(2)
  })

  it('400s on a table sectionIndex (use addRow instead)', async () => {
    const bodyWithTable = {
      sections: [...CHECKLIST_BODY.sections, { type: 'table', columns: ['a'], rows: [[{ text: 'x', sourceItemIds: [], confidence: 'suggested' }]] }],
    }
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: bodyWithTable }, []))
    const res = await callPatch({ action: 'addItem', sectionIndex: 2, text: 'x' })
    expect(res.status).toBe(400)
  })

  it('400s on empty text', async () => {
    const res = await callPatch({ action: 'addItem', sectionIndex: 0, text: '   ' })
    expect(res.status).toBe(400)
  })

  it('400s on an out-of-range sectionIndex', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'addItem', sectionIndex: 99, text: 'x' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/envelopes/[id] — addRow (DRO-232)', () => {
  const TABLE_BODY = {
    sections: [
      {
        type: 'table',
        columns: ['Item', 'Qty'],
        rows: [[{ text: 'Milk', sourceItemIds: ['item-1'], confidence: 'from_item' }, { text: '1', sourceItemIds: [], confidence: 'suggested' }]],
      },
    ],
  }

  it('appends a row of user leaves, one per column', async () => {
    const updates: unknown[] = []
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: TABLE_BODY }, updates))

    const res = await callPatch({ action: 'addRow', sectionIndex: 0, cells: ['Eggs', '12'] })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.body.sections[0].rows).toHaveLength(2)
    expect(json.body.sections[0].rows[1]).toEqual([
      { text: 'Eggs', sourceItemIds: [], confidence: 'suggested', origin: 'user' },
      { text: '12', sourceItemIds: [], confidence: 'suggested', origin: 'user' },
    ])
  })

  it('400s when cells.length does not match the column count', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: TABLE_BODY }, []))
    const res = await callPatch({ action: 'addRow', sectionIndex: 0, cells: ['Eggs'] })
    expect(res.status).toBe(400)
  })

  it('400s when sectionIndex is not a table section', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'addRow', sectionIndex: 0, cells: ['x'] })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/envelopes/[id] — deleteItem (DRO-232)', () => {
  it('removes a checklist leaf by index', async () => {
    const updates: unknown[] = []
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, updates))

    const res = await callPatch({ action: 'deleteItem', sectionIndex: 0, itemIndex: 0 })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.body.sections[0].items).toEqual([{ text: 'Pack tent', sourceItemIds: [], confidence: 'suggested' }])
  })

  it('removes a whole table row by index', async () => {
    const tableBody = {
      sections: [
        {
          type: 'table',
          columns: ['a'],
          rows: [
            [{ text: 'row 1', sourceItemIds: [], confidence: 'suggested' }],
            [{ text: 'row 2', sourceItemIds: [], confidence: 'suggested' }],
          ],
        },
      ],
    }
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: tableBody }, []))
    const res = await callPatch({ action: 'deleteItem', sectionIndex: 0, itemIndex: 0 })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.body.sections[0].rows).toEqual([[{ text: 'row 2', sourceItemIds: [], confidence: 'suggested' }]])
  })

  it('400s on an out-of-range itemIndex', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'deleteItem', sectionIndex: 0, itemIndex: 99 })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/envelopes/[id] — addSection (DRO-232)', () => {
  it('appends a new checklist section with a heading and one user leaf', async () => {
    const updates: unknown[] = []
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, updates))

    const res = await callPatch({ action: 'addSection', blockType: 'checklist', heading: 'Packing', text: 'Bring sunscreen' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.body.sections).toHaveLength(3)
    expect(json.body.sections[2]).toEqual({
      type: 'checklist',
      heading: 'Packing',
      items: [{ text: 'Bring sunscreen', sourceItemIds: [], confidence: 'suggested', origin: 'user' }],
    })
  })

  it('never stores a heading key on a new notes section', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'addSection', blockType: 'notes', text: 'Some thoughts' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect('heading' in json.body.sections[2]).toBe(false)
  })

  it('400s on empty text', async () => {
    const res = await callPatch({ action: 'addSection', blockType: 'checklist', text: '  ' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/envelopes/[id] — renameSection (DRO-232)', () => {
  it('renames a checklist section heading', async () => {
    const updates: unknown[] = []
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, updates))

    const res = await callPatch({ action: 'renameSection', sectionIndex: 0, heading: 'New heading' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.body.sections[0].heading).toBe('New heading')
  })

  it('400s on a notes section (no heading to rename)', async () => {
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: CHECKLIST_BODY }, []))
    const res = await callPatch({ action: 'renameSection', sectionIndex: 1, heading: 'New heading' })
    expect(res.status).toBe(400)
  })

  it('400s on empty heading', async () => {
    const res = await callPatch({ action: 'renameSection', sectionIndex: 0, heading: '  ' })
    expect(res.status).toBe(400)
  })
})
