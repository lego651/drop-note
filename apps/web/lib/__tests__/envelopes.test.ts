import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AIProvider, EnvelopeSourceItem } from '@drop-note/shared'
import { fetchEnvelopeSourceItems, runEnvelopeGeneration, ENVELOPE_GEN_RATE_LIMIT_PER_HOUR } from '../envelopes'

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
})
