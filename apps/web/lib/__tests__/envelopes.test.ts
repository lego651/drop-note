import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AIProvider, EnvelopeBody, EnvelopeSourceItem, EnvelopeSuggestCandidateItem } from '@drop-note/shared'
import {
  fetchEnvelopeSourceItems,
  fetchEnvelopeSuggestCandidates,
  runEnvelopeGeneration,
  runEnvelopeSuggestion,
  ENVELOPE_GEN_RATE_LIMIT_PER_HOUR,
  ENVELOPE_SUGGEST_RATE_LIMIT_PER_HOUR,
  ENVELOPE_SUGGEST_CANDIDATE_CAP,
  buildEnvelopeListItem,
  type EnvelopeListRow,
} from '../envelopes'

// A minimal stand-in for the chainable Supabase query builder (same recipe as
// lib/__tests__/categories.test.ts): every filter method returns itself, and
// the chain resolves via `.then`.
type Call = { method: string; args: unknown[] }
function chainable(resolve: () => { data: unknown; error: unknown }) {
  const calls: Call[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  for (const method of ['select', 'in', 'eq', 'is']) {
    chain[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
      return chain
    })
  }
  chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled)
  chain.__calls = calls
  return chain
}

function fakeProvider(responses: string[] | (() => string)): AIProvider {
  let i = 0
  const generateStructured = vi.fn(async () => {
    if (Array.isArray(responses)) {
      const r = responses[Math.min(i, responses.length - 1)]
      i += 1
      return r
    }
    return responses()
  })
  return {
    processText: vi.fn(),
    describeImage: vi.fn(),
    generateStructured,
  } as unknown as AIProvider
}

const ITEMS: EnvelopeSourceItem[] = [
  { id: 'item-1', subject: 'Trail map', aiSummary: 'A hiking trail', sourceUrl: null, sourceType: 'article', notes: null, categoryName: 'Sports' },
  { id: 'item-2', subject: 'Boots', aiSummary: 'Hiking boots', sourceUrl: null, sourceType: 'email_body', notes: null, categoryName: 'Shopping' },
]

describe('ENVELOPE_GEN_RATE_LIMIT_PER_HOUR', () => {
  it('is a sane positive hourly cap, separate from ingest limits', () => {
    expect(ENVELOPE_GEN_RATE_LIMIT_PER_HOUR).toBeGreaterThan(0)
  })
})

describe('fetchEnvelopeSourceItems', () => {
  it('maps DB rows (including the joined category name) to EnvelopeSourceItem', async () => {
    const chain = chainable(() => ({
      data: [
        {
          id: 'item-1',
          subject: 'Trail map',
          ai_summary: 'A hiking trail',
          source_url: 'https://example.com',
          source_type: 'article',
          notes: 'bring boots',
          categories: { name: 'Sports' },
        },
      ],
      error: null,
    }))
    const supabase = { from: vi.fn(() => chain) }

    const result = await fetchEnvelopeSourceItems(supabase as unknown as Parameters<typeof fetchEnvelopeSourceItems>[0], 'user-1', ['item-1'])

    expect(result).toEqual([
      {
        id: 'item-1',
        subject: 'Trail map',
        aiSummary: 'A hiking trail',
        sourceUrl: 'https://example.com',
        sourceType: 'article',
        notes: 'bring boots',
        categoryName: 'Sports',
      },
    ])
  })

  it('returns categoryName: null for an item with no category', async () => {
    const chain = chainable(() => ({
      data: [
        { id: 'item-1', subject: 'x', ai_summary: null, source_url: null, source_type: null, notes: null, categories: null },
      ],
      error: null,
    }))
    const supabase = { from: vi.fn(() => chain) }

    const result = await fetchEnvelopeSourceItems(supabase as unknown as Parameters<typeof fetchEnvelopeSourceItems>[0], 'user-1', ['item-1'])
    expect(result[0].categoryName).toBeNull()
  })

  it('throws (rather than silently returning []) when the query errors, so the route marks the envelope failed instead of generating an ungrounded plan', async () => {
    const chain = chainable(() => ({ data: null, error: new Error('db down') }))
    const supabase = { from: vi.fn(() => chain) }

    await expect(
      fetchEnvelopeSourceItems(supabase as unknown as Parameters<typeof fetchEnvelopeSourceItems>[0], 'user-1', ['item-1']),
    ).rejects.toThrow()
  })
})

describe('runEnvelopeGeneration', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns status "done" for a valid checklist response', async () => {
    const provider = fakeProvider([
      JSON.stringify({ sections: [{ type: 'checklist', items: [{ text: 'Pack boots', sourceItemIds: ['item-2'], confidence: 'from_item' }] }] }),
    ])

    const result = await runEnvelopeGeneration(provider, ITEMS, 'Make a shopping list from these', 'shopping_list')
    expect(result.status).toBe('done')
    if (result.status === 'failed') throw new Error('expected success')
    expect(result.body.sections[0].type).toBe('checklist')
  })

  it('falls back to a notes block for a free-text request that does not map to checklist/list/table, and still returns "done"', async () => {
    const provider = fakeProvider([
      JSON.stringify({ sections: [{ type: 'notes', items: [{ text: 'These are a hiking trail and boots — not much more to say.', sourceItemIds: ['item-1', 'item-2'], confidence: 'from_item' }] }] }),
    ])

    const result = await runEnvelopeGeneration(provider, ITEMS, 'what do you think of these?', null)
    expect(result.status).toBe('done')
    if (result.status === 'failed') throw new Error('expected success')
    expect(result.body.sections[0].type).toBe('notes')
  })

  it('retries once with the validation error appended after an invalid first response, and succeeds on the retry', async () => {
    const provider = fakeProvider([
      JSON.stringify({ sections: [{ type: 'checklist', items: [{ text: 'x', sourceItemIds: [], confidence: 'certain' }] }] }), // invalid confidence
      JSON.stringify({ sections: [{ type: 'checklist', items: [{ text: 'x', sourceItemIds: [], confidence: 'suggested' }] }] }),
    ])

    const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null)
    expect(result.status).toBe('done')
    expect(provider.generateStructured).toHaveBeenCalledTimes(2)
    const secondCallArgs = (provider.generateStructured as ReturnType<typeof vi.fn>).mock.calls[1]
    expect(secondCallArgs[1]).toContain('Validation error')
  })

  it('returns status "failed" with an error_message when both attempts are invalid JSON', async () => {
    const provider = fakeProvider(['not json', 'still not json'])

    const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null)
    expect(result.status).toBe('failed')
    if (result.status !== 'failed') throw new Error('expected failure')
    expect(result.errorMessage).toBeTruthy()
    expect(provider.generateStructured).toHaveBeenCalledTimes(2)
  })

  it('skips the retry (fails fast) when the first attempt already used most of the time budget, so the route stays well under maxDuration=60 (DRO-197)', async () => {
    const provider = fakeProvider(['not json', 'still not json'])
    let now = 0
    const clock = () => {
      const current = now
      now += 21_000 // first attempt "took" 21s, over RETRY_TIME_BUDGET_MS
      return current
    }

    const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null, clock)
    expect(result.status).toBe('failed')
    expect(provider.generateStructured).toHaveBeenCalledTimes(1)
  })

  it('still retries when the first attempt was fast', async () => {
    const provider = fakeProvider([
      JSON.stringify({ sections: [{ type: 'checklist', items: [{ text: 'x', sourceItemIds: [], confidence: 'certain' }] }] }), // invalid confidence
      JSON.stringify({ sections: [{ type: 'checklist', items: [{ text: 'x', sourceItemIds: [], confidence: 'suggested' }] }] }),
    ])
    let now = 0
    const clock = () => {
      const current = now
      now += 1_000 // first attempt "took" 1s, well under the budget
      return current
    }

    const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null, clock)
    expect(result.status).toBe('done')
    expect(provider.generateStructured).toHaveBeenCalledTimes(2)
  })

  it('returns status "failed" when the AI provider throws', async () => {
    const provider: AIProvider = {
      processText: vi.fn(),
      describeImage: vi.fn(),
      generateStructured: vi.fn().mockRejectedValue(new Error('OpenAI HTTP 500')),
    }

    const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null)
    expect(result.status).toBe('failed')
  })

  it('downgrades to status "partial" when a leaf cites an id outside this envelope (spoofed/cross-user id)', async () => {
    const provider = fakeProvider([
      JSON.stringify({
        sections: [{ type: 'checklist', items: [{ text: 'Suspicious line', sourceItemIds: ['item-from-another-users-envelope'], confidence: 'from_item' }] }],
      }),
    ])

    const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null)
    expect(result.status).toBe('partial')
    if (result.status === 'failed') throw new Error('expected success')
    const section = result.body.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.items[0].sourceItemIds).toEqual([])
    expect(section.items[0].confidence).toBe('suggested')
  })

  describe('regenerate-with-edits (DRO-195)', () => {
    it('appends the previous body\'s checked/edited state to the prompt when previousBody is given', async () => {
      const provider = fakeProvider([
        JSON.stringify({ sections: [{ type: 'checklist', items: [{ text: 'Pack boots', sourceItemIds: ['item-2'], confidence: 'from_item' }] }] }),
      ])
      const previousBody = {
        sections: [
          {
            type: 'checklist' as const,
            items: [{ text: 'Pack boots', sourceItemIds: ['item-2'], confidence: 'from_item' as const, checked: true }],
          },
        ],
      }

      await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null, Date.now, previousBody)

      const [, userPrompt] = (provider.generateStructured as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(userPrompt).toContain('previous version of this plan')
      expect(userPrompt).toContain('Pack boots')
      expect(userPrompt).toContain('checked off')
    })

    it('does not append any regeneration note when previousBody is omitted (first-time generation)', async () => {
      const provider = fakeProvider([
        JSON.stringify({ sections: [{ type: 'notes', items: [{ text: 'ok', sourceItemIds: [], confidence: 'suggested' }] }] }),
      ])

      await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null)

      const [, userPrompt] = (provider.generateStructured as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(userPrompt).not.toContain('previous version of this plan')
    })

    it('still strips a spoofed citation on a regenerated body, same as first-time generation', async () => {
      const provider = fakeProvider([
        JSON.stringify({
          sections: [{ type: 'checklist', items: [{ text: 'Suspicious line', sourceItemIds: ['not-a-real-item'], confidence: 'from_item' }] }],
        }),
      ])
      const previousBody = {
        sections: [{ type: 'checklist' as const, items: [{ text: 'Old line', sourceItemIds: [], confidence: 'suggested' as const, checked: true }] }],
      }

      const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null, Date.now, previousBody)
      expect(result.status).toBe('partial')
      if (result.status === 'failed') throw new Error('expected success')
      const section = result.body.sections[0]
      if (section.type !== 'checklist') throw new Error('expected checklist')
      expect(section.items[0].sourceItemIds).toEqual([])
      expect(section.items[0].confidence).toBe('suggested')
    })

    it('carries a checked leaf\'s progress onto the matching fresh leaf by text, so regenerating does not reset it to 0/N', async () => {
      const provider = fakeProvider([
        JSON.stringify({
          sections: [
            {
              type: 'checklist',
              items: [
                { text: 'Pack boots', sourceItemIds: ['item-2'], confidence: 'from_item' },
                { text: 'Pack map', sourceItemIds: ['item-1'], confidence: 'from_item' },
              ],
            },
          ],
        }),
      ])
      const previousBody = {
        sections: [{ type: 'checklist' as const, items: [{ text: 'Pack boots', sourceItemIds: ['item-2'], confidence: 'from_item' as const, checked: true }] }],
      }

      const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null, Date.now, previousBody)
      if (result.status === 'failed') throw new Error('expected success')
      const section = result.body.sections[0]
      if (section.type !== 'checklist') throw new Error('expected checklist')
      expect(section.items[0].checked).toBe(true)
      expect(section.items[1].checked).toBeUndefined()
    })

    it('strips any checked/edited the model echoed back before carrying forward, so the model cannot claim a line done on its own', async () => {
      const provider = fakeProvider([
        JSON.stringify({
          sections: [
            {
              type: 'checklist',
              items: [{ text: 'Model-claimed line', sourceItemIds: [], confidence: 'suggested', checked: true, edited: true }],
            },
          ],
        }),
      ])

      const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null)
      if (result.status === 'failed') throw new Error('expected success')
      const section = result.body.sections[0]
      if (section.type !== 'checklist') throw new Error('expected checklist')
      expect(section.items[0].checked).toBeUndefined()
      expect(section.items[0].edited).toBeUndefined()
    })

    it('strips a forged origin: "user" the model echoed back, so the model cannot forge a user-authored line (DRO-232)', async () => {
      const provider = fakeProvider([
        JSON.stringify({
          sections: [
            {
              type: 'checklist',
              items: [{ text: 'Forged line', sourceItemIds: [], confidence: 'suggested', origin: 'user' }],
            },
          ],
        }),
      ])

      const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null)
      if (result.status === 'failed') throw new Error('expected success')
      const section = result.body.sections[0]
      if (section.type !== 'checklist') throw new Error('expected checklist')
      expect(section.items[0].origin).toBeUndefined()
    })

    it('carries the user\'s hand-added line forward into the matching fresh section by heading (DRO-232)', async () => {
      const provider = fakeProvider([
        JSON.stringify({
          sections: [{ type: 'checklist', heading: 'Pack', items: [{ text: 'Pack boots', sourceItemIds: ['item-2'], confidence: 'from_item' }] }],
        }),
      ])
      const previousBody = {
        sections: [
          {
            type: 'checklist' as const,
            heading: 'Pack',
            items: [
              { text: 'Pack boots', sourceItemIds: ['item-2'], confidence: 'from_item' as const },
              { text: 'Bring sunscreen', sourceItemIds: [], confidence: 'suggested' as const, origin: 'user' as const },
            ],
          },
        ],
      }

      const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null, Date.now, previousBody)
      if (result.status === 'failed') throw new Error('expected success')
      const section = result.body.sections[0]
      if (section.type !== 'checklist') throw new Error('expected checklist')
      expect(section.items).toHaveLength(2)
      expect(section.items[1]).toEqual({ text: 'Bring sunscreen', sourceItemIds: [], confidence: 'suggested', origin: 'user' })
    })

    it('buckets a user-added section with no matching fresh heading into a trailing "Your additions" section (DRO-232)', async () => {
      const provider = fakeProvider([
        JSON.stringify({ sections: [{ type: 'checklist', items: [{ text: 'Fresh line', sourceItemIds: [], confidence: 'suggested' }] }] }),
      ])
      const previousBody = {
        sections: [
          {
            type: 'checklist' as const,
            heading: 'My own section',
            items: [{ text: 'My own line', sourceItemIds: [], confidence: 'suggested' as const, origin: 'user' as const }],
          },
        ],
      }

      const result = await runEnvelopeGeneration(provider, ITEMS, 'make a checklist', null, Date.now, previousBody)
      if (result.status === 'failed') throw new Error('expected success')
      expect(result.body.sections).toHaveLength(2)
      const added = result.body.sections[1]
      if (added.type !== 'checklist') throw new Error('expected checklist')
      expect(added.heading).toBe('Your additions')
      expect(added.items).toEqual([{ text: 'My own line', sourceItemIds: [], confidence: 'suggested', origin: 'user' }])
    })
  })
})

describe('buildEnvelopeListItem (DRO-223)', () => {
  const CHECKLIST_BODY: EnvelopeBody = {
    sections: [
      {
        type: 'checklist',
        items: [
          { text: 'a', sourceItemIds: [], confidence: 'suggested', checked: true },
          { text: 'b', sourceItemIds: [], confidence: 'suggested', checked: false },
        ],
      },
    ],
  }

  function row(overrides: Partial<EnvelopeListRow> = {}): EnvelopeListRow {
    return {
      id: 'env-1',
      intent_input: { text: 'Plan my weekend', purposeHint: 'weekend_plan' },
      status: 'done',
      body: CHECKLIST_BODY,
      created_at: '2026-10-18T00:00:00Z',
      ...overrides,
    }
  }

  it('derives title (from the purpose chip), intent text, status, progress, and source item count', () => {
    const result = buildEnvelopeListItem(row(), 3)
    expect(result).toEqual({
      id: 'env-1',
      title: 'Weekend plan',
      intentText: 'Plan my weekend',
      status: 'done',
      progress: { checked: 1, total: 2 },
      createdAt: '2026-10-18T00:00:00Z',
      sourceItemCount: 3,
    })
  })

  it('falls back to the generic title when no purpose hint was set', () => {
    const result = buildEnvelopeListItem(row({ intent_input: { text: 'Do something', purposeHint: null } }), 2)
    expect(result?.title).toBe('Plan')
  })

  it('omits progress when the body has no checklist blocks', () => {
    const notesBody: EnvelopeBody = { sections: [{ type: 'notes', items: [{ text: 'x', sourceItemIds: [], confidence: 'suggested' }] }] }
    const result = buildEnvelopeListItem(row({ body: notesBody }), 1)
    expect(result?.progress).toBeNull()
  })

  it('omits progress when there is no body yet (generating/failed)', () => {
    const result = buildEnvelopeListItem(row({ status: 'generating', body: null }), 2)
    expect(result?.progress).toBeNull()
    expect(result?.status).toBe('generating')
  })

  it('omits progress when the stored body fails to parse', () => {
    const result = buildEnvelopeListItem(row({ body: { not: 'a valid envelope body' } }), 2)
    expect(result?.progress).toBeNull()
  })

  it('returns null when intent_input does not match the stored schema', () => {
    const result = buildEnvelopeListItem(row({ intent_input: { nope: true } }), 0)
    expect(result).toBeNull()
  })
})

// --- DRO-300: envelope suggest (Engine B retrieval) ------------------------

describe('ENVELOPE_SUGGEST_RATE_LIMIT_PER_HOUR', () => {
  it('is a sane positive hourly cap, separate from envelope_gen', () => {
    expect(ENVELOPE_SUGGEST_RATE_LIMIT_PER_HOUR).toBeGreaterThan(0)
  })
})

describe('fetchEnvelopeSuggestCandidates', () => {
  // A richer stand-in than the module-level `chainable` above: supports the extra
  // chain methods the suggest retrieval needs (`or`, `order`, `limit`), and lets a
  // test queue up a different response per call to the same table (e.g. the
  // `items` table is queried once per retrieval stage).
  function queuedFrom(queues: Record<string, Array<() => { data: unknown; error: unknown }>>) {
    const counters: Record<string, number> = {}
    const calls: Record<string, { method: string; args: unknown[] }[][]> = {}
    const from = vi.fn((table: string) => {
      const queue = queues[table] ?? []
      const idx = counters[table] ?? 0
      counters[table] = idx + 1
      const resolve = queue[Math.min(idx, queue.length - 1)] ?? (() => ({ data: null, error: null }))

      const tableCalls: { method: string; args: unknown[] }[] = []
      calls[table] = calls[table] ?? []
      calls[table].push(tableCalls)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {}
      for (const method of ['select', 'eq', 'is', 'in', 'or', 'order', 'limit']) {
        chain[method] = vi.fn((...args: unknown[]) => {
          tableCalls.push({ method, args })
          return chain
        })
      }
      chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled)
      return chain
    })
    return { from, calls }
  }

  function itemRow(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      subject: `Subject ${id}`,
      ai_summary: null,
      notes: null,
      source_type: null,
      categories: null,
      item_tags: [],
      ...overrides,
    }
  }

  it('returns stage-1 (text/exact tag/category) matches without widening when they already meet the pick threshold', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => itemRow(`item-${i}`))
    const { from, calls } = queuedFrom({
      tags: [() => ({ data: [], error: null })],
      categories: [() => ({ data: [], error: null })],
      items: [() => ({ data: rows, error: null })],
    })

    const result = await fetchEnvelopeSuggestCandidates({ from } as unknown as Parameters<typeof fetchEnvelopeSuggestCandidates>[0], 'user-1', 'weekend errands')

    expect(result).toHaveLength(8)
    expect(calls.items).toHaveLength(1) // no widen, no recency fallback needed
  })

  it('falls back to recency-only when nothing matches the query text/tags/categories', async () => {
    const recentRows = [itemRow('recent-1'), itemRow('recent-2')]
    const { from, calls } = queuedFrom({
      tags: [() => ({ data: [], error: null })],
      categories: [() => ({ data: [], error: null })],
      items: [
        () => ({ data: [], error: null }), // stage 1: nothing
        () => ({ data: [], error: null }), // widen: still nothing
        () => ({ data: recentRows, error: null }), // recency fallback
      ],
    })

    const result = await fetchEnvelopeSuggestCandidates({ from } as unknown as Parameters<typeof fetchEnvelopeSuggestCandidates>[0], 'user-1', 'nothing matches this')

    expect(result.map((c) => c.id)).toEqual(['recent-1', 'recent-2'])
    expect(calls.items).toHaveLength(3)
  })

  it('skips straight to the recency fallback when the query tokenizes to nothing', async () => {
    const recentRows = [itemRow('recent-1')]
    const { from, calls } = queuedFrom({
      items: [() => ({ data: recentRows, error: null })],
    })

    // Single-char "words" all get dropped by tokenizeEnvelopeSuggestQuery (min length 2).
    const result = await fetchEnvelopeSuggestCandidates({ from } as unknown as Parameters<typeof fetchEnvelopeSuggestCandidates>[0], 'user-1', 'a b c')

    expect(result.map((c) => c.id)).toEqual(['recent-1'])
    expect(calls.tags).toBeUndefined()
    expect(calls.categories).toBeUndefined()
    expect(calls.items).toHaveLength(1)
  })

  it('includes an item matched only through an exact tag-name overlap with the query', async () => {
    const { from, calls } = queuedFrom({
      tags: [() => ({ data: [{ id: 'tag-1', name: 'Costco' }], error: null })],
      categories: [() => ({ data: [], error: null })],
      item_tags: [() => ({ data: [{ item_id: 'item-tagged' }], error: null })],
      items: [() => ({ data: [itemRow('item-tagged')], error: null })],
    })

    const result = await fetchEnvelopeSuggestCandidates({ from } as unknown as Parameters<typeof fetchEnvelopeSuggestCandidates>[0], 'user-1', 'costco')

    expect(result.map((c) => c.id)).toEqual(['item-tagged'])
    const itemTagsCall = calls.item_tags[0].find((c) => c.method === 'in')
    expect(itemTagsCall?.args).toEqual(['tag_id', ['tag-1']])
  })

  it('dedupes an item returned by more than one stage', async () => {
    const dup = itemRow('item-dup')
    const { from } = queuedFrom({
      tags: [() => ({ data: [], error: null })],
      categories: [() => ({ data: [], error: null })],
      items: [
        () => ({ data: [dup], error: null }), // stage 1
        () => ({ data: [dup, itemRow('item-new')], error: null }), // widen re-finds it plus one new row
      ],
    })

    const result = await fetchEnvelopeSuggestCandidates({ from } as unknown as Parameters<typeof fetchEnvelopeSuggestCandidates>[0], 'user-1', 'errands')

    expect(result.map((c) => c.id).sort()).toEqual(['item-dup', 'item-new'])
  })

  it('maps the joined category name and tag names onto the candidate shape', async () => {
    const row = itemRow('item-1', {
      subject: 'Costco run',
      ai_summary: 'Buy snacks',
      source_type: 'email_body',
      categories: { name: 'Shopping' },
      item_tags: [{ tags: { name: 'errands' } }, { tags: null }],
    })
    const rows = [row, ...Array.from({ length: 7 }, (_, i) => itemRow(`filler-${i}`))]
    const { from } = queuedFrom({
      tags: [() => ({ data: [], error: null })],
      categories: [() => ({ data: [], error: null })],
      items: [() => ({ data: rows, error: null })],
    })

    const result = await fetchEnvelopeSuggestCandidates({ from } as unknown as Parameters<typeof fetchEnvelopeSuggestCandidates>[0], 'user-1', 'costco errands')

    expect(result.find((c) => c.id === 'item-1')).toEqual({
      id: 'item-1',
      subject: 'Costco run',
      aiSummary: 'Buy snacks',
      sourceType: 'email_body',
      notes: null,
      categoryName: 'Shopping',
      tagNames: ['errands'],
    })
  })

  it('caps the merged candidate set at ENVELOPE_SUGGEST_CANDIDATE_CAP', async () => {
    const rows = Array.from({ length: ENVELOPE_SUGGEST_CANDIDATE_CAP + 10 }, (_, i) => itemRow(`item-${i}`))
    const { from } = queuedFrom({
      tags: [() => ({ data: [], error: null })],
      categories: [() => ({ data: [], error: null })],
      items: [() => ({ data: rows, error: null })],
    })

    const result = await fetchEnvelopeSuggestCandidates({ from } as unknown as Parameters<typeof fetchEnvelopeSuggestCandidates>[0], 'user-1', 'errands')

    expect(result.length).toBeLessThanOrEqual(ENVELOPE_SUGGEST_CANDIDATE_CAP)
  })
})

describe('runEnvelopeSuggestion', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const CANDIDATES: EnvelopeSuggestCandidateItem[] = [
    { id: 'item-1', subject: 'Costco run', aiSummary: 'Buy snacks', sourceType: 'email_body', notes: null, categoryName: 'Shopping', tagNames: ['errands'] },
    { id: 'item-2', subject: 'Trail map', aiSummary: 'A hiking trail', sourceType: 'article', notes: null, categoryName: 'Sports', tagNames: [] },
  ]

  it('returns status "ok" with the model\'s picks for a valid response', async () => {
    const provider = fakeProvider([
      JSON.stringify({ items: [{ itemId: 'item-1', reason: 'mentions Costco' }] }),
    ])

    const result = await runEnvelopeSuggestion(provider, CANDIDATES, 'weekend errands')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.picks).toEqual([{ itemId: 'item-1', reason: 'mentions Costco' }])
  })

  it('drops a picked id outside the candidate set (hallucination guard)', async () => {
    const provider = fakeProvider([
      JSON.stringify({
        items: [
          { itemId: 'item-1', reason: 'mentions Costco' },
          { itemId: 'not-a-real-candidate', reason: 'hallucinated' },
        ],
      }),
    ])

    const result = await runEnvelopeSuggestion(provider, CANDIDATES, 'weekend errands')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.picks.map((p) => p.itemId)).toEqual(['item-1'])
  })

  it('retries once with the validation error appended after an invalid first response', async () => {
    const provider = fakeProvider([
      JSON.stringify({ items: [{ itemId: 'item-1' }] }), // missing required "reason"
      JSON.stringify({ items: [{ itemId: 'item-1', reason: 'mentions Costco' }] }),
    ])

    const result = await runEnvelopeSuggestion(provider, CANDIDATES, 'weekend errands')
    expect(result.status).toBe('ok')
    expect(provider.generateStructured).toHaveBeenCalledTimes(2)
    const secondCallArgs = (provider.generateStructured as ReturnType<typeof vi.fn>).mock.calls[1]
    expect(secondCallArgs[1]).toContain('Validation error')
  })

  it('returns status "failed" when both attempts are invalid JSON', async () => {
    const provider = fakeProvider(['not json', 'still not json'])

    const result = await runEnvelopeSuggestion(provider, CANDIDATES, 'weekend errands')
    expect(result.status).toBe('failed')
    if (result.status !== 'failed') throw new Error('expected failure')
    expect(result.errorMessage).toBeTruthy()
    expect(provider.generateStructured).toHaveBeenCalledTimes(2)
  })

  it('skips the retry when the first attempt already used most of the time budget', async () => {
    const provider = fakeProvider(['not json', 'still not json'])
    let now = 0
    const clock = () => {
      const current = now
      now += 21_000
      return current
    }

    const result = await runEnvelopeSuggestion(provider, CANDIDATES, 'weekend errands', clock)
    expect(result.status).toBe('failed')
    expect(provider.generateStructured).toHaveBeenCalledTimes(1)
  })

  it('returns status "failed" when the AI provider throws', async () => {
    const provider: AIProvider = {
      processText: vi.fn(),
      describeImage: vi.fn(),
      generateStructured: vi.fn().mockRejectedValue(new Error('OpenAI HTTP 500')),
    }

    const result = await runEnvelopeSuggestion(provider, CANDIDATES, 'weekend errands')
    expect(result.status).toBe('failed')
  })
})
