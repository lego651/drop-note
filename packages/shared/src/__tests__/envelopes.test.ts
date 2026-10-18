import { describe, it, expect } from 'vitest'
import {
  parseEnvelopeBody,
  enforceEnvelopeCitations,
  buildEnvelopeSystemPrompt,
  buildEnvelopeUserPrompt,
  buildEnvelopeRegenerationContext,
  appendValidationRetryNote,
  updateEnvelopeLeaf,
  countEnvelopeChecklistProgress,
  stripEnvelopeProgressFields,
  carryForwardEnvelopeProgress,
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

  it('downgrades a "from_item" leaf that cites nothing — claiming grounded with no citation is not trustworthy either', () => {
    const body: EnvelopeBody = {
      sections: [
        {
          type: 'checklist',
          items: [{ text: 'Milk', sourceItemIds: [], confidence: 'from_item' }],
        },
      ],
    }
    const { body: result, stripped } = enforceEnvelopeCitations(body, ['item-1'])
    expect(stripped).toBe(true)
    const section = result.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.items[0].confidence).toBe('suggested')
  })

  it('leaves a "suggested" leaf with no citations untouched (that combination is expected, not a violation)', () => {
    const body: EnvelopeBody = {
      sections: [{ type: 'notes', items: [{ text: 'x', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    const { stripped } = enforceEnvelopeCitations(body, ['item-1'])
    expect(stripped).toBe(false)
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

describe('updateEnvelopeLeaf (DRO-195)', () => {
  const body: EnvelopeBody = {
    sections: [
      {
        type: 'checklist',
        heading: 'Pack',
        items: [
          { text: 'Tent', sourceItemIds: ['item-1'], confidence: 'from_item' },
          { text: 'Stove', sourceItemIds: [], confidence: 'suggested' },
        ],
      },
      {
        type: 'table',
        columns: ['a'],
        rows: [[{ text: 'row', sourceItemIds: [], confidence: 'suggested' }]],
      },
    ],
  }

  it('toggles a leaf and persists it round-trip through parseEnvelopeBody', () => {
    const toggled = updateEnvelopeLeaf(body, 0, 0, (leaf) => ({ ...leaf, checked: !leaf.checked }))
    expect(toggled).not.toBeNull()
    expect((toggled!.sections[0] as { items: { checked?: boolean }[] }).items[0].checked).toBe(true)
    // Round-trip: stored body (e.g. read back from Postgres jsonb) still parses and keeps the checked state.
    const reparsed = parseEnvelopeBody(JSON.parse(JSON.stringify(toggled)))
    expect(reparsed.success).toBe(true)
    if (reparsed.success) {
      expect((reparsed.data.sections[0] as { items: { checked?: boolean }[] }).items[0].checked).toBe(true)
    }
    // The other leaf and sections are untouched.
    expect((toggled!.sections[0] as { items: { checked?: boolean }[] }).items[1].checked).toBeUndefined()
    expect(toggled!.sections[1]).toEqual(body.sections[1])
  })

  it('edits a leaf\'s text and marks it edited, leaving checked state alone', () => {
    const checkedFirst = updateEnvelopeLeaf(body, 0, 0, (leaf) => ({ ...leaf, checked: true }))!
    const edited = updateEnvelopeLeaf(checkedFirst, 0, 0, (leaf) => ({ ...leaf, text: 'New tent', edited: true }))
    const leaf = (edited!.sections[0] as { items: { text: string; checked?: boolean; edited?: boolean }[] }).items[0]
    expect(leaf.text).toBe('New tent')
    expect(leaf.edited).toBe(true)
    expect(leaf.checked).toBe(true)
  })

  it('returns null for an out-of-range sectionIndex', () => {
    expect(updateEnvelopeLeaf(body, 5, 0, (leaf) => leaf)).toBeNull()
  })

  it('returns null for an out-of-range itemIndex', () => {
    expect(updateEnvelopeLeaf(body, 0, 5, (leaf) => leaf)).toBeNull()
  })

  it('returns null when the section is a table (table rows are not addressable)', () => {
    expect(updateEnvelopeLeaf(body, 1, 0, (leaf) => leaf)).toBeNull()
  })
})

describe('countEnvelopeChecklistProgress (DRO-195)', () => {
  it('counts checked vs total across checklist blocks only', () => {
    const body: EnvelopeBody = {
      sections: [
        {
          type: 'checklist',
          items: [
            { text: 'a', sourceItemIds: [], confidence: 'suggested', checked: true },
            { text: 'b', sourceItemIds: [], confidence: 'suggested', checked: false },
            { text: 'c', sourceItemIds: [], confidence: 'suggested' },
          ],
        },
        {
          type: 'list',
          items: [{ text: 'not a checklist', sourceItemIds: [], confidence: 'suggested', checked: true }],
        },
      ],
    }
    expect(countEnvelopeChecklistProgress(body)).toEqual({ checked: 1, total: 3 })
  })

  it('returns 0/0 when there are no checklist blocks', () => {
    const body: EnvelopeBody = { sections: [{ type: 'notes', items: [{ text: 'x', sourceItemIds: [], confidence: 'suggested' }] }] }
    expect(countEnvelopeChecklistProgress(body)).toEqual({ checked: 0, total: 0 })
  })
})

describe('buildEnvelopeRegenerationContext (DRO-195)', () => {
  it('returns an empty string when nothing was checked or edited', () => {
    const body: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'a', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    expect(buildEnvelopeRegenerationContext(body)).toBe('')
  })

  it('includes checked and edited leaves with their marks, and omits untouched ones', () => {
    const body: EnvelopeBody = {
      sections: [
        {
          type: 'checklist',
          items: [
            { text: 'Checked item', sourceItemIds: [], confidence: 'suggested', checked: true },
            { text: 'Untouched item', sourceItemIds: [], confidence: 'suggested' },
            { text: 'Edited item', sourceItemIds: [], confidence: 'suggested', edited: true },
          ],
        },
      ],
    }
    const context = buildEnvelopeRegenerationContext(body)
    expect(context).toContain('Checked item')
    expect(context).toContain('checked off')
    expect(context).toContain('Edited item')
    expect(context).toContain('edited by the user')
    expect(context).not.toContain('Untouched item')
  })

  it('skips table rows', () => {
    const body: EnvelopeBody = {
      sections: [
        {
          type: 'table',
          columns: ['a'],
          rows: [[{ text: 'Table cell', sourceItemIds: [], confidence: 'suggested', checked: true }]],
        },
      ],
    }
    expect(buildEnvelopeRegenerationContext(body)).toBe('')
  })
})

describe('stripEnvelopeProgressFields (DRO-195)', () => {
  it('removes checked and edited from every leaf, including inside table rows', () => {
    const body: EnvelopeBody = {
      sections: [
        {
          type: 'checklist',
          items: [{ text: 'a', sourceItemIds: [], confidence: 'suggested', checked: true, edited: true }],
        },
        {
          type: 'table',
          columns: ['x'],
          rows: [[{ text: 'cell', sourceItemIds: [], confidence: 'suggested', checked: true }]],
        },
      ],
    }
    const stripped = stripEnvelopeProgressFields(body)
    const checklist = stripped.sections[0]
    if (checklist.type !== 'checklist') throw new Error('expected checklist')
    expect(checklist.items[0].checked).toBeUndefined()
    expect(checklist.items[0].edited).toBeUndefined()
    const table = stripped.sections[1]
    if (table.type !== 'table') throw new Error('expected table')
    expect(table.rows[0][0].checked).toBeUndefined()
  })

  it('leaves a leaf with neither field untouched', () => {
    const body: EnvelopeBody = {
      sections: [{ type: 'notes', items: [{ text: 'a', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    expect(stripEnvelopeProgressFields(body)).toEqual(body)
  })
})

describe('carryForwardEnvelopeProgress (DRO-195)', () => {
  it('carries checked/edited onto a fresh leaf with matching text', () => {
    const previousBody: EnvelopeBody = {
      sections: [
        {
          type: 'checklist',
          items: [
            { text: 'Pack boots', sourceItemIds: [], confidence: 'suggested', checked: true },
            { text: 'Pack tent', sourceItemIds: [], confidence: 'suggested', edited: true },
          ],
        },
      ],
    }
    const freshBody: EnvelopeBody = {
      sections: [
        {
          type: 'checklist',
          items: [
            { text: '  pack boots  ', sourceItemIds: ['item-1'], confidence: 'from_item' },
            { text: 'Pack tent', sourceItemIds: [], confidence: 'suggested' },
            { text: 'Brand new line', sourceItemIds: [], confidence: 'suggested' },
          ],
        },
      ],
    }

    const result = carryForwardEnvelopeProgress(freshBody, previousBody)
    const section = result.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.items[0].checked).toBe(true)
    expect(section.items[1].edited).toBe(true)
    expect(section.items[2].checked).toBeUndefined()
    expect(section.items[2].edited).toBeUndefined()
  })

  it('does not double-claim the same previous leaf for two identical-text fresh leaves', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'Buy milk', sourceItemIds: [], confidence: 'suggested', checked: true }] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [
        {
          type: 'checklist',
          items: [
            { text: 'Buy milk', sourceItemIds: [], confidence: 'suggested' },
            { text: 'Buy milk', sourceItemIds: [], confidence: 'suggested' },
          ],
        },
      ],
    }

    const result = carryForwardEnvelopeProgress(freshBody, previousBody)
    const section = result.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.items[0].checked).toBe(true)
    expect(section.items[1].checked).toBeUndefined()
  })

  it('ignores untouched previous leaves (not checked or edited) as match candidates', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'Untouched', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'Untouched', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    const result = carryForwardEnvelopeProgress(freshBody, previousBody)
    expect(result).toEqual(freshBody)
  })

  it('leaves table rows untouched', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'Row', sourceItemIds: [], confidence: 'suggested', checked: true }] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'table', columns: ['a'], rows: [[{ text: 'Row', sourceItemIds: [], confidence: 'suggested' }]] }],
    }
    const result = carryForwardEnvelopeProgress(freshBody, previousBody)
    const table = result.sections[0]
    if (table.type !== 'table') throw new Error('expected table')
    expect(table.rows[0][0].checked).toBeUndefined()
  })

  it('returns freshBody unchanged when previousBody has no checked/edited leaves', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'a', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'a', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    expect(carryForwardEnvelopeProgress(freshBody, previousBody)).toBe(freshBody)
  })
})
