import { describe, it, expect } from 'vitest'
import {
  parseEnvelopeBody,
  enforceEnvelopeCitations,
  buildEnvelopeSystemPrompt,
  buildEnvelopeUserPrompt,
  appendValidationRetryNote,
  EnvelopeIntentInputSchema,
  type EnvelopeBody,
} from '../envelopes'

describe('parseEnvelopeBody', () => {
  it('accepts a valid checklist body', () => {
    const raw = {
      sections: [
        {
          type: 'checklist',
          heading: 'Shopping list',
          items: [
            { text: 'Milk', sourceItemIds: ['item-1'], confidence: 'from_item' },
            { text: 'Eggs', sourceItemIds: [], confidence: 'suggested', missing: 'quantity' },
          ],
        },
      ],
    }
    const result = parseEnvelopeBody(raw)
    expect(result.success).toBe(true)
  })

  it('accepts a valid notes body with no heading', () => {
    const raw = {
      sections: [
        {
          type: 'notes',
          items: [{ text: 'These items are a mixed bag.', sourceItemIds: [], confidence: 'suggested' }],
        },
      ],
    }
    const result = parseEnvelopeBody(raw)
    expect(result.success).toBe(true)
  })

  it('rejects a notes block that includes a heading', () => {
    const raw = {
      sections: [
        {
          type: 'notes',
          heading: 'Not allowed',
          items: [{ text: 'x', sourceItemIds: [], confidence: 'suggested' }],
        },
      ],
    }
    const result = parseEnvelopeBody(raw)
    expect(result.success).toBe(false)
  })

  it('rejects a leaf with an invalid confidence value', () => {
    const raw = {
      sections: [
        {
          type: 'checklist',
          items: [{ text: 'x', sourceItemIds: [], confidence: 'certain' }],
        },
      ],
    }
    const result = parseEnvelopeBody(raw)
    expect(result.success).toBe(false)
  })

  it('rejects an unknown block type', () => {
    const raw = { sections: [{ type: 'paragraph', items: [] }] }
    const result = parseEnvelopeBody(raw)
    expect(result.success).toBe(false)
  })

  it('rejects an empty sections array', () => {
    const result = parseEnvelopeBody({ sections: [] })
    expect(result.success).toBe(false)
  })

  it('rejects a completely malformed payload', () => {
    const result = parseEnvelopeBody({ not: 'an envelope' })
    expect(result.success).toBe(false)
  })

  it('accepts a table block (schema arm exists even though the renderer is optional this slice)', () => {
    const raw = {
      sections: [
        {
          type: 'table',
          columns: ['Item', 'Qty'],
          rows: [
            [
              { text: 'Milk', sourceItemIds: ['item-1'], confidence: 'from_item' },
              { text: '2', sourceItemIds: [], confidence: 'suggested' },
            ],
          ],
        },
      ],
    }
    const result = parseEnvelopeBody(raw)
    expect(result.success).toBe(true)
  })
})

describe('EnvelopeIntentInputSchema', () => {
  it('accepts text at the max length cap', () => {
    const result = EnvelopeIntentInputSchema.safeParse({ text: 'a'.repeat(500), purposeHint: null })
    expect(result.success).toBe(true)
  })

  it('rejects text over the max length cap', () => {
    const result = EnvelopeIntentInputSchema.safeParse({ text: 'a'.repeat(501), purposeHint: null })
    expect(result.success).toBe(false)
  })

  it('rejects empty text', () => {
    const result = EnvelopeIntentInputSchema.safeParse({ text: '', purposeHint: null })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown purposeHint', () => {
    const result = EnvelopeIntentInputSchema.safeParse({ text: 'hi', purposeHint: 'something_else' })
    expect(result.success).toBe(false)
  })
})

describe('enforceEnvelopeCitations', () => {
  it('leaves citations untouched when every sourceItemId is allowed', () => {
    const body: EnvelopeBody = {
      sections: [
        {
          type: 'checklist',
          items: [{ text: 'Milk', sourceItemIds: ['item-1'], confidence: 'from_item' }],
        },
      ],
    }
    const { body: result, stripped } = enforceEnvelopeCitations(body, ['item-1', 'item-2'])
    expect(stripped).toBe(false)
    expect(result).toEqual(body)
  })

  it('strips a spoofed id belonging to a different envelope/user and downgrades confidence', () => {
    const body: EnvelopeBody = {
      sections: [
        {
          type: 'checklist',
          items: [
            {
              text: 'Confidential note from another user',
              sourceItemIds: ['item-from-another-user'],
              confidence: 'from_item',
            },
          ],
        },
      ],
    }
    const { body: result, stripped } = enforceEnvelopeCitations(body, ['item-1', 'item-2'])
    expect(stripped).toBe(true)
    const section = result.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.items[0].sourceItemIds).toEqual([])
    expect(section.items[0].confidence).toBe('suggested')
  })

  it('keeps the valid ids and only strips the invalid one when a leaf cites a mix', () => {
    const body: EnvelopeBody = {
      sections: [
        {
          type: 'list',
          items: [{ text: 'x', sourceItemIds: ['item-1', 'spoofed-id'], confidence: 'from_item' }],
        },
      ],
    }
    const { body: result, stripped } = enforceEnvelopeCitations(body, ['item-1'])
    expect(stripped).toBe(true)
    const section = result.sections[0]
    if (section.type !== 'list') throw new Error('expected list')
    expect(section.items[0].sourceItemIds).toEqual(['item-1'])
    expect(section.items[0].confidence).toBe('suggested')
  })

  it('enforces citations inside table rows too', () => {
    const body: EnvelopeBody = {
      sections: [
        {
          type: 'table',
          columns: ['Item'],
          rows: [[{ text: 'Milk', sourceItemIds: ['spoofed-id'], confidence: 'from_item' }]],
        },
      ],
    }
    const { body: result, stripped } = enforceEnvelopeCitations(body, ['item-1'])
    expect(stripped).toBe(true)
    const section = result.sections[0]
    if (section.type !== 'table') throw new Error('expected table')
    expect(section.rows[0][0].sourceItemIds).toEqual([])
    expect(section.rows[0][0].confidence).toBe('suggested')
  })

  it('accepts a Set directly for allowedItemIds', () => {
    const body: EnvelopeBody = {
      sections: [{ type: 'notes', items: [{ text: 'x', sourceItemIds: ['item-1'], confidence: 'from_item' }] }],
    }
    const { stripped } = enforceEnvelopeCitations(body, new Set(['item-1']))
    expect(stripped).toBe(false)
  })
})

describe('buildEnvelopeSystemPrompt / buildEnvelopeUserPrompt', () => {
  it('system prompt names all 4 block types and the notes fallback rule', () => {
    const prompt = buildEnvelopeSystemPrompt()
    expect(prompt).toContain('checklist')
    expect(prompt).toContain('"list"')
    expect(prompt).toContain('"notes"')
    expect(prompt).toContain('do NOT force a checklist shape')
  })

  it('user prompt includes every item id and the free text, and free text is noted as winning over the hint', () => {
    const prompt = buildEnvelopeUserPrompt(
      [
        { id: 'item-1', subject: 'Recipe', aiSummary: 'A pasta recipe', sourceUrl: null, sourceType: 'email_body', notes: null, categoryName: 'Food & Drink' },
        { id: 'item-2', subject: 'Trail map', aiSummary: null, sourceUrl: 'https://example.com', sourceType: 'article', notes: 'bring boots', categoryName: 'Sports' },
      ],
      'Make a shopping list from these',
      'shopping_list',
    )
    expect(prompt).toContain('item-1')
    expect(prompt).toContain('item-2')
    expect(prompt).toContain('Make a shopping list from these')
    expect(prompt).toContain('always wins over the hint')
    expect(prompt).toContain('Shopping list')
  })

  it('user prompt omits the hint line when no purposeHint is given', () => {
    const prompt = buildEnvelopeUserPrompt(
      [{ id: 'item-1', subject: 'x', aiSummary: null, sourceUrl: null, sourceType: null, notes: null, categoryName: null }],
      'free text only',
      null,
    )
    expect(prompt).not.toContain('chip was tapped')
  })
})

describe('appendValidationRetryNote', () => {
  it('appends the validation error to the original prompt', () => {
    const note = appendValidationRetryNote('original prompt', 'items[0].confidence: invalid enum value')
    expect(note).toContain('original prompt')
    expect(note).toContain('items[0].confidence: invalid enum value')
  })
})
