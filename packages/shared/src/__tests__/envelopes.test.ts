import { describe, it, expect } from 'vitest'
import {
  parseEnvelopeBody,
  enforceEnvelopeCitations,
  buildEnvelopeSystemPrompt,
  buildEnvelopeUserPrompt,
  buildEnvelopeRegenerationContext,
  appendValidationRetryNote,
  updateEnvelopeLeaf,
  addEnvelopeItem,
  addEnvelopeTableRow,
  deleteEnvelopeItem,
  addEnvelopeSection,
  renameEnvelopeSection,
  createUserLeaf,
  countEnvelopeChecklistProgress,
  stripEnvelopeProgressFields,
  carryForwardEnvelopeProgress,
  carryForwardUserContent,
  getEnvelopeTitle,
  EnvelopeIntentInputSchema,
  EnvelopePatchRequestSchema,
  parseEnvelopeIdeaPool,
  enforceEnvelopeIdeaPoolItemIds,
  pickRandomEnvelopeIdeas,
  pickSurpriseEnvelopeIdea,
  buildEnvelopeIdeaPoolSystemPrompt,
  buildEnvelopeIdeaPoolUserPrompt,
  ENVELOPE_STARTER_IDEAS,
  ENVELOPE_IDEA_POOL_SIZE,
  type EnvelopeBody,
  type EnvelopeIdea,
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

  it('rejects a table row whose cell count does not match the column count', () => {
    const raw = {
      sections: [
        {
          type: 'table',
          columns: ['Item', 'Qty'],
          rows: [[{ text: 'Milk', sourceItemIds: [], confidence: 'suggested' }]],
        },
      ],
    }
    const result = parseEnvelopeBody(raw)
    expect(result.success).toBe(false)
  })

  it('rejects an AI leaf (no origin) claiming "from_item" confidence with no citation (DRO-232)', () => {
    const raw = {
      sections: [
        {
          type: 'checklist',
          items: [{ text: 'Milk', sourceItemIds: [], confidence: 'from_item' }],
        },
      ],
    }
    const result = parseEnvelopeBody(raw)
    expect(result.success).toBe(false)
  })

  it('accepts a user leaf (origin: "user") with "from_item" confidence and no citation (DRO-232)', () => {
    const raw = {
      sections: [
        {
          type: 'checklist',
          items: [{ text: 'Milk', sourceItemIds: [], confidence: 'from_item', origin: 'user' }],
        },
      ],
    }
    const result = parseEnvelopeBody(raw)
    expect(result.success).toBe(true)
  })

  it('accepts a plain user leaf built by createUserLeaf', () => {
    const raw = { sections: [{ type: 'checklist', items: [createUserLeaf('Buy milk')] }] }
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

  it('system prompt describes the table shape and when to use it (DRO-196)', () => {
    const prompt = buildEnvelopeSystemPrompt()
    expect(prompt).toContain('"table"')
    expect(prompt).toContain('"columns"')
    expect(prompt).toContain('"rows"')
    expect(prompt).toContain('comparison')
    expect(prompt).toContain('one leaf per column')
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

describe('getEnvelopeTitle (DRO-223)', () => {
  it('returns the matching purpose chip label when a hint was tapped', () => {
    expect(getEnvelopeTitle({ purposeHint: 'weekend_plan' })).toBe('Weekend plan')
    expect(getEnvelopeTitle({ purposeHint: 'shopping_list' })).toBe('Shopping list')
    expect(getEnvelopeTitle({ purposeHint: 'day_route' })).toBe('Day route')
    expect(getEnvelopeTitle({ purposeHint: 'next_steps' })).toBe('Next steps')
  })

  it('falls back to a generic title when no purpose hint was set', () => {
    expect(getEnvelopeTitle({ purposeHint: null })).toBe('Plan')
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

  it('strips a forged origin: "user" from an AI provider response (DRO-232)', () => {
    const body: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'Forged line', sourceItemIds: [], confidence: 'suggested', origin: 'user' }] }],
    }
    const stripped = stripEnvelopeProgressFields(body)
    const section = stripped.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.items[0].origin).toBeUndefined()
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

describe('createUserLeaf (DRO-232)', () => {
  it('builds a leaf with no citation, suggested confidence, and origin: user', () => {
    expect(createUserLeaf('Buy milk')).toEqual({
      text: 'Buy milk',
      sourceItemIds: [],
      confidence: 'suggested',
      origin: 'user',
    })
  })
})

describe('addEnvelopeItem (DRO-232)', () => {
  const body: EnvelopeBody = {
    sections: [
      { type: 'checklist', items: [{ text: 'Tent', sourceItemIds: [], confidence: 'suggested' }] },
      { type: 'table', columns: ['a'], rows: [[{ text: 'row', sourceItemIds: [], confidence: 'suggested' }]] },
    ],
  }

  it('appends a user leaf to the end of a checklist section', () => {
    const result = addEnvelopeItem(body, 0, 'Stove')!
    const section = result.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.items).toHaveLength(2)
    expect(section.items[1]).toEqual(createUserLeaf('Stove'))
    expect(section.items[0]).toEqual({ text: 'Tent', sourceItemIds: [], confidence: 'suggested' })
  })

  it('returns null for an out-of-range sectionIndex', () => {
    expect(addEnvelopeItem(body, 5, 'x')).toBeNull()
  })

  it('returns null for a table section', () => {
    expect(addEnvelopeItem(body, 1, 'x')).toBeNull()
  })

  it('round-trips through parseEnvelopeBody', () => {
    const result = addEnvelopeItem(body, 0, 'Stove')!
    expect(parseEnvelopeBody(JSON.parse(JSON.stringify(result))).success).toBe(true)
  })
})

describe('addEnvelopeTableRow (DRO-232)', () => {
  const body: EnvelopeBody = {
    sections: [
      { type: 'checklist', items: [{ text: 'a', sourceItemIds: [], confidence: 'suggested' }] },
      {
        type: 'table',
        columns: ['Item', 'Qty'],
        rows: [[{ text: 'Milk', sourceItemIds: [], confidence: 'suggested' }, { text: '1', sourceItemIds: [], confidence: 'suggested' }]],
      },
    ],
  }

  it('appends a row of user leaves, one per column', () => {
    const result = addEnvelopeTableRow(body, 1, ['Eggs', '12'])!
    const section = result.sections[1]
    if (section.type !== 'table') throw new Error('expected table')
    expect(section.rows).toHaveLength(2)
    expect(section.rows[1]).toEqual([createUserLeaf('Eggs'), createUserLeaf('12')])
  })

  it('returns null when cells.length does not match columns.length', () => {
    expect(addEnvelopeTableRow(body, 1, ['Eggs'])).toBeNull()
  })

  it('returns null for a non-table section', () => {
    expect(addEnvelopeTableRow(body, 0, ['x'])).toBeNull()
  })

  it('returns null for an out-of-range sectionIndex', () => {
    expect(addEnvelopeTableRow(body, 5, ['x', 'y'])).toBeNull()
  })
})

describe('deleteEnvelopeItem (DRO-232)', () => {
  const body: EnvelopeBody = {
    sections: [
      {
        type: 'checklist',
        items: [
          { text: 'Tent', sourceItemIds: [], confidence: 'suggested' },
          { text: 'Stove', sourceItemIds: [], confidence: 'suggested' },
        ],
      },
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

  it('removes a checklist leaf by index, leaving the others intact', () => {
    const result = deleteEnvelopeItem(body, 0, 0)!
    const section = result.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.items).toEqual([{ text: 'Stove', sourceItemIds: [], confidence: 'suggested' }])
  })

  it('removes a whole table row by index', () => {
    const result = deleteEnvelopeItem(body, 1, 0)!
    const section = result.sections[1]
    if (section.type !== 'table') throw new Error('expected table')
    expect(section.rows).toEqual([[{ text: 'row 2', sourceItemIds: [], confidence: 'suggested' }]])
  })

  it('returns null for an out-of-range itemIndex', () => {
    expect(deleteEnvelopeItem(body, 0, 99)).toBeNull()
  })

  it('returns null for an out-of-range sectionIndex', () => {
    expect(deleteEnvelopeItem(body, 5, 0)).toBeNull()
  })

  it('works on an AI-generated leaf, not just a user-added one', () => {
    const result = deleteEnvelopeItem(body, 0, 1)!
    const section = result.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.items).toEqual([{ text: 'Tent', sourceItemIds: [], confidence: 'suggested' }])
  })

  it('drops the section entirely when deleting its last list item, instead of leaving an empty items array', () => {
    const twoSection: EnvelopeBody = {
      sections: [
        { type: 'list', heading: 'Only item', items: [{ text: 'Solo', sourceItemIds: [], confidence: 'suggested' }] },
        { type: 'checklist', items: [{ text: 'Other', sourceItemIds: [], confidence: 'suggested' }] },
      ],
    }
    const result = deleteEnvelopeItem(twoSection, 0, 0)!
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0]).toEqual(twoSection.sections[1])
    expect(parseEnvelopeBody(JSON.parse(JSON.stringify(result))).success).toBe(true)
  })

  it('drops the section entirely when deleting its last notes line', () => {
    const twoSection: EnvelopeBody = {
      sections: [
        { type: 'notes', items: [{ text: 'Only note', sourceItemIds: [], confidence: 'suggested' }] },
        { type: 'checklist', items: [{ text: 'Other', sourceItemIds: [], confidence: 'suggested' }] },
      ],
    }
    const result = deleteEnvelopeItem(twoSection, 0, 0)!
    expect(result.sections).toHaveLength(1)
    expect(parseEnvelopeBody(JSON.parse(JSON.stringify(result))).success).toBe(true)
  })

  it('drops the section entirely when deleting its last table row', () => {
    const twoSection: EnvelopeBody = {
      sections: [
        { type: 'table', columns: ['a'], rows: [[{ text: 'Only row', sourceItemIds: [], confidence: 'suggested' }]] },
        { type: 'checklist', items: [{ text: 'Other', sourceItemIds: [], confidence: 'suggested' }] },
      ],
    }
    const result = deleteEnvelopeItem(twoSection, 0, 0)!
    expect(result.sections).toHaveLength(1)
    expect(parseEnvelopeBody(JSON.parse(JSON.stringify(result))).success).toBe(true)
  })

  it('rejects deleting the very last line of the whole plan', () => {
    const onlyLine: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'Solo', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    expect(deleteEnvelopeItem(onlyLine, 0, 0)).toBeNull()
  })

  it('rejects deleting the very last row of the whole plan when the only section is a table', () => {
    const onlyRow: EnvelopeBody = {
      sections: [{ type: 'table', columns: ['a'], rows: [[{ text: 'Solo', sourceItemIds: [], confidence: 'suggested' }]] }],
    }
    expect(deleteEnvelopeItem(onlyRow, 0, 0)).toBeNull()
  })
})

describe('addEnvelopeSection (DRO-232)', () => {
  const body: EnvelopeBody = {
    sections: [{ type: 'checklist', items: [{ text: 'a', sourceItemIds: [], confidence: 'suggested' }] }],
  }

  it('appends a checklist section with a heading and one user leaf', () => {
    const result = addEnvelopeSection(body, 'checklist', 'Packing', 'Bring sunscreen')
    expect(result.sections).toHaveLength(2)
    expect(result.sections[1]).toEqual({ type: 'checklist', heading: 'Packing', items: [createUserLeaf('Bring sunscreen')] })
  })

  it('appends a list section without a heading when none is given', () => {
    const result = addEnvelopeSection(body, 'list', undefined, 'Buy milk')
    expect(result.sections[1]).toEqual({ type: 'list', heading: undefined, items: [createUserLeaf('Buy milk')] })
  })

  it('never puts a heading key on a new notes section, even if one is passed', () => {
    const result = addEnvelopeSection(body, 'notes', 'Ignored', 'Some thoughts')
    expect(result.sections[1]).toEqual({ type: 'notes', items: [createUserLeaf('Some thoughts')] })
    expect('heading' in result.sections[1]).toBe(false)
  })

  it('round-trips through parseEnvelopeBody', () => {
    const result = addEnvelopeSection(body, 'checklist', 'Packing', 'Bring sunscreen')
    expect(parseEnvelopeBody(JSON.parse(JSON.stringify(result))).success).toBe(true)
  })
})

describe('renameEnvelopeSection (DRO-232)', () => {
  const body: EnvelopeBody = {
    sections: [
      { type: 'checklist', heading: 'Old heading', items: [{ text: 'a', sourceItemIds: [], confidence: 'suggested' }] },
      { type: 'notes', items: [{ text: 'b', sourceItemIds: [], confidence: 'suggested' }] },
    ],
  }

  it('renames a checklist section heading', () => {
    const result = renameEnvelopeSection(body, 0, 'New heading')!
    const section = result.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.heading).toBe('New heading')
  })

  it('returns null for a notes section (no heading to rename)', () => {
    expect(renameEnvelopeSection(body, 1, 'New heading')).toBeNull()
  })

  it('returns null for an out-of-range sectionIndex', () => {
    expect(renameEnvelopeSection(body, 5, 'New heading')).toBeNull()
  })
})

describe('carryForwardUserContent (DRO-232)', () => {
  it('carries a user leaf forward into a fresh section with the same heading', () => {
    const previousBody: EnvelopeBody = {
      sections: [
        {
          type: 'checklist',
          heading: 'Pack',
          items: [
            { text: 'Tent', sourceItemIds: ['item-1'], confidence: 'from_item' },
            createUserLeaf('Bring sunscreen'),
          ],
        },
      ],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'checklist', heading: 'Pack', items: [{ text: 'Sleeping bag', sourceItemIds: ['item-1'], confidence: 'from_item' }] }],
    }

    const result = carryForwardUserContent(freshBody, previousBody)
    const section = result.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.items).toHaveLength(2)
    expect(section.items[1]).toEqual(createUserLeaf('Bring sunscreen'))
  })

  it('buckets an unmatched user leaf into a trailing "Your additions" section', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'checklist', heading: 'Pack', items: [createUserLeaf('Bring sunscreen')] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'checklist', heading: 'Prep', items: [{ text: 'Book flights', sourceItemIds: [], confidence: 'suggested' }] }],
    }

    const result = carryForwardUserContent(freshBody, previousBody)
    expect(result.sections).toHaveLength(2)
    const added = result.sections[1]
    if (added.type !== 'checklist') throw new Error('expected checklist')
    expect(added.heading).toBe('Your additions')
    expect(added.items).toEqual([createUserLeaf('Bring sunscreen')])
  })

  it('carries forward an entire user-created section (every leaf shares its own unmatched heading) as one "Your additions" bucket', () => {
    const previousBody: EnvelopeBody = {
      sections: [
        { type: 'checklist', heading: 'AI section', items: [{ text: 'AI line', sourceItemIds: [], confidence: 'suggested' }] },
        { type: 'checklist', heading: 'My own section', items: [createUserLeaf('Line one'), createUserLeaf('Line two')] },
      ],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'checklist', heading: 'AI section', items: [{ text: 'Fresh AI line', sourceItemIds: [], confidence: 'suggested' }] }],
    }

    const result = carryForwardUserContent(freshBody, previousBody)
    expect(result.sections).toHaveLength(2)
    const added = result.sections[1]
    if (added.type !== 'checklist') throw new Error('expected checklist')
    expect(added.heading).toBe('Your additions')
    expect(added.items).toEqual([createUserLeaf('Line one'), createUserLeaf('Line two')])
  })

  it('ignores AI leaves (no origin) when collecting what to carry forward', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'checklist', heading: 'Pack', items: [{ text: 'AI line', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'checklist', heading: 'Prep', items: [{ text: 'Fresh line', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    expect(carryForwardUserContent(freshBody, previousBody)).toBe(freshBody)
  })

  it('carries a user-added table row forward into a fresh table with the same heading and columns', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'table', heading: 'Compare', columns: ['Item', 'Price'], rows: [[createUserLeaf('Tent'), createUserLeaf('$80')]] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [
        {
          type: 'table',
          heading: 'Compare',
          columns: ['Item', 'Price'],
          rows: [[{ text: 'Stove', sourceItemIds: ['item-1'], confidence: 'from_item' }, { text: '$40', sourceItemIds: ['item-1'], confidence: 'from_item' }]],
        },
      ],
    }

    const result = carryForwardUserContent(freshBody, previousBody)
    const section = result.sections[0]
    if (section.type !== 'table') throw new Error('expected table')
    expect(section.rows).toHaveLength(2)
    expect(section.rows[1]).toEqual([createUserLeaf('Tent'), createUserLeaf('$80')])
  })

  it('flattens a user-added table row into "Your additions" when no fresh table shares its heading/columns', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'table', heading: 'Compare', columns: ['Item', 'Price'], rows: [[createUserLeaf('Tent'), createUserLeaf('$80')]] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'Fresh line', sourceItemIds: [], confidence: 'suggested' }] }],
    }

    const result = carryForwardUserContent(freshBody, previousBody)
    expect(result.sections).toHaveLength(2)
    const added = result.sections[1]
    if (added.type !== 'checklist') throw new Error('expected checklist')
    expect(added.heading).toBe('Your additions')
    expect(added.items).toEqual([createUserLeaf('Tent — $80')])
  })

  it('does not carry an AI-generated table row forward, only a fully user-added one', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'table', columns: ['a'], rows: [[{ text: 'AI row', sourceItemIds: [], confidence: 'suggested' }]] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'table', columns: ['a'], rows: [[{ text: 'Fresh row', sourceItemIds: [], confidence: 'suggested' }]] }],
    }
    expect(carryForwardUserContent(freshBody, previousBody)).toBe(freshBody)
  })

  it('carries a user leaf from a notes block forward into a headingless fresh checklist/list section', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'notes', items: [createUserLeaf('A note I added')] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'Fresh line', sourceItemIds: [], confidence: 'suggested' }] }],
    }

    const result = carryForwardUserContent(freshBody, previousBody)
    const section = result.sections[0]
    if (section.type !== 'checklist') throw new Error('expected checklist')
    expect(section.items).toEqual([{ text: 'Fresh line', sourceItemIds: [], confidence: 'suggested' }, createUserLeaf('A note I added')])
  })

  it('buckets a user leaf from a notes block into "Your additions" when no headingless fresh section exists', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'notes', items: [createUserLeaf('A note I added')] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'checklist', heading: 'Prep', items: [{ text: 'Fresh line', sourceItemIds: [], confidence: 'suggested' }] }],
    }

    const result = carryForwardUserContent(freshBody, previousBody)
    expect(result.sections).toHaveLength(2)
    const added = result.sections[1]
    if (added.type !== 'checklist') throw new Error('expected checklist')
    expect(added.heading).toBe('Your additions')
    expect(added.items).toEqual([createUserLeaf('A note I added')])
  })

  it('returns freshBody unchanged when previousBody has no user leaves', () => {
    const previousBody: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'a', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    const freshBody: EnvelopeBody = {
      sections: [{ type: 'checklist', items: [{ text: 'a', sourceItemIds: [], confidence: 'suggested' }] }],
    }
    expect(carryForwardUserContent(freshBody, previousBody)).toBe(freshBody)
  })

  it('does not merge two headingless user-row buckets with different columns into one entry (review round 2)', () => {
    // Two previous headingless tables with different column counts, each with a user row.
    const previousBody: EnvelopeBody = {
      sections: [
        { type: 'table', columns: ['a', 'b'], rows: [[createUserLeaf('1'), createUserLeaf('2')]] },
        { type: 'table', columns: ['x', 'y', 'z'], rows: [[createUserLeaf('7'), createUserLeaf('8'), createUserLeaf('9')]] },
      ],
    }
    // A fresh table whose columns match only the first previous table.
    const freshBody: EnvelopeBody = {
      sections: [
        {
          type: 'table',
          columns: ['a', 'b'],
          rows: [[{ text: 'fresh-1', sourceItemIds: [], confidence: 'suggested' }, { text: 'fresh-2', sourceItemIds: [], confidence: 'suggested' }]],
        },
      ],
    }

    const result = carryForwardUserContent(freshBody, previousBody)
    expect(parseEnvelopeBody(result).success).toBe(true)

    const table = result.sections[0]
    if (table.type !== 'table') throw new Error('expected table')
    expect(table.columns).toEqual(['a', 'b'])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[1]).toEqual([createUserLeaf('1'), createUserLeaf('2')])

    // The [x, y, z] row has no matching fresh table, so it must be flattened into
    // "Your additions" rather than silently merged into the [a, b] bucket above.
    const added = result.sections[1]
    if (added.type !== 'checklist') throw new Error('expected checklist')
    expect(added.heading).toBe('Your additions')
    expect(added.items).toEqual([createUserLeaf('7 — 8 — 9')])
  })
})

describe('EnvelopePatchRequestSchema (DRO-232)', () => {
  it('accepts every action variant', () => {
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'toggle', sectionIndex: 0, itemIndex: 0, checked: true }).success).toBe(true)
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'edit', sectionIndex: 0, itemIndex: 0, text: 'x' }).success).toBe(true)
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'addItem', sectionIndex: 0, text: 'x' }).success).toBe(true)
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'addRow', sectionIndex: 0, cells: ['a', 'b'] }).success).toBe(true)
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'deleteItem', sectionIndex: 0, itemIndex: 0 }).success).toBe(true)
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'addSection', blockType: 'checklist', text: 'x' }).success).toBe(true)
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'addSection', blockType: 'checklist', heading: 'H', text: 'x' }).success).toBe(true)
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'renameSection', sectionIndex: 0, heading: 'H' }).success).toBe(true)
  })

  it('rejects an unknown action', () => {
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'delete', sectionIndex: 0, itemIndex: 0 }).success).toBe(false)
  })

  it('rejects addItem text over the max length cap', () => {
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'addItem', sectionIndex: 0, text: 'a'.repeat(501) }).success).toBe(false)
  })

  it('rejects addItem with empty text', () => {
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'addItem', sectionIndex: 0, text: '   ' }).success).toBe(false)
  })

  it('rejects a negative sectionIndex', () => {
    expect(EnvelopePatchRequestSchema.safeParse({ action: 'addItem', sectionIndex: -1, text: 'x' }).success).toBe(false)
  })
})

describe('parseEnvelopeIdeaPool', () => {
  it('accepts a valid pool', () => {
    const raw = {
      ideas: [
        { label: 'Weekend hike ideas', emoji: '🥾', seedTerms: ['hike', 'trail'], matchingItemIds: ['item-1'] },
      ],
    }
    const result = parseEnvelopeIdeaPool(raw)
    expect(result.success).toBe(true)
  })

  it('rejects an idea with no seedTerms', () => {
    const raw = { ideas: [{ label: 'x', seedTerms: [], matchingItemIds: [] }] }
    expect(parseEnvelopeIdeaPool(raw).success).toBe(false)
  })

  it('rejects more than ENVELOPE_IDEA_POOL_SIZE ideas', () => {
    const idea = { label: 'x', seedTerms: ['a'], matchingItemIds: [] }
    const raw = { ideas: Array.from({ length: ENVELOPE_IDEA_POOL_SIZE + 1 }, () => idea) }
    expect(parseEnvelopeIdeaPool(raw).success).toBe(false)
  })

  it('rejects an empty ideas array', () => {
    expect(parseEnvelopeIdeaPool({ ideas: [] }).success).toBe(false)
  })

  it('rejects malformed input entirely', () => {
    expect(parseEnvelopeIdeaPool({ notIdeas: [] }).success).toBe(false)
  })
})

describe('enforceEnvelopeIdeaPoolItemIds', () => {
  it('strips matchingItemIds outside the allowed set', () => {
    const pool = { ideas: [{ label: 'x', seedTerms: ['a'], matchingItemIds: ['item-1', 'item-2'] }] }
    const result = enforceEnvelopeIdeaPoolItemIds(pool, ['item-1'])
    expect(result.ideas[0].matchingItemIds).toEqual(['item-1'])
  })

  it('leaves an idea with no matchingItemIds untouched', () => {
    const pool = { ideas: [{ label: 'x', seedTerms: ['a'], matchingItemIds: [] }] }
    const result = enforceEnvelopeIdeaPoolItemIds(pool, ['item-1'])
    expect(result.ideas[0].matchingItemIds).toEqual([])
  })

  it('accepts a Set as well as an array for allowedItemIds', () => {
    const pool = { ideas: [{ label: 'x', seedTerms: ['a'], matchingItemIds: ['item-1', 'item-2'] }] }
    const result = enforceEnvelopeIdeaPoolItemIds(pool, new Set(['item-2']))
    expect(result.ideas[0].matchingItemIds).toEqual(['item-2'])
  })
})

describe('pickRandomEnvelopeIdeas', () => {
  const ideas: EnvelopeIdea[] = Array.from({ length: 12 }, (_, i) => ({
    label: `idea-${i}`,
    seedTerms: ['x'],
    matchingItemIds: [],
  }))

  it('returns exactly `count` ideas', () => {
    const result = pickRandomEnvelopeIdeas(ideas, 5, () => 0)
    expect(result).toHaveLength(5)
  })

  it('never returns more than the pool has', () => {
    const result = pickRandomEnvelopeIdeas(ideas.slice(0, 3), 5, () => 0)
    expect(result).toHaveLength(3)
  })

  it('returns no duplicates', () => {
    const result = pickRandomEnvelopeIdeas(ideas, 12, Math.random)
    const labels = new Set(result.map((idea) => idea.label))
    expect(labels.size).toBe(12)
  })

  it('does not mutate the input array', () => {
    const copy = [...ideas]
    pickRandomEnvelopeIdeas(ideas, 5)
    expect(ideas).toEqual(copy)
  })

  it('is deterministic for a fixed rng', () => {
    const a = pickRandomEnvelopeIdeas(ideas, 5, () => 0.5)
    const b = pickRandomEnvelopeIdeas(ideas, 5, () => 0.5)
    expect(a).toEqual(b)
  })
})

describe('pickSurpriseEnvelopeIdea', () => {
  it('returns null for an empty pool', () => {
    expect(pickSurpriseEnvelopeIdea([])).toBeNull()
  })

  it('returns one of the given ideas', () => {
    const ideas: EnvelopeIdea[] = [
      { label: 'a', seedTerms: ['x'], matchingItemIds: [] },
      { label: 'b', seedTerms: ['y'], matchingItemIds: [] },
    ]
    const result = pickSurpriseEnvelopeIdea(ideas, () => 0.9)
    expect(result).toEqual(ideas[1])
  })
})

describe('ENVELOPE_STARTER_IDEAS', () => {
  it('has exactly the 4 board-specified starter chips', () => {
    expect(ENVELOPE_STARTER_IDEAS.map((idea) => idea.label)).toEqual([
      'Feel like exercising',
      'Pick up some reading',
      'Do some work',
      'Play with my kid',
    ])
  })

  it('every starter chip has at least one seed term', () => {
    for (const idea of ENVELOPE_STARTER_IDEAS) {
      expect(idea.seedTerms.length).toBeGreaterThan(0)
    }
  })
})

describe('buildEnvelopeIdeaPoolSystemPrompt', () => {
  it('mentions the JSON shape and the pool size cap', () => {
    const prompt = buildEnvelopeIdeaPoolSystemPrompt()
    expect(prompt).toContain('"ideas"')
    expect(prompt).toContain(String(ENVELOPE_IDEA_POOL_SIZE))
  })
})

describe('buildEnvelopeIdeaPoolUserPrompt', () => {
  it('includes category/tag counts and recent item subjects', () => {
    const prompt = buildEnvelopeIdeaPoolUserPrompt({
      categoryCounts: [{ name: 'Recipes', count: 4 }],
      tagCounts: [{ name: 'italian', count: 2 }],
      recentItems: [{ id: 'item-1', subject: 'Pasta recipe' }],
    })
    expect(prompt).toContain('Recipes: 4')
    expect(prompt).toContain('italian: 2')
    expect(prompt).toContain('Pasta recipe')
  })

  it('renders "(none)" for empty signals', () => {
    const prompt = buildEnvelopeIdeaPoolUserPrompt({ categoryCounts: [], tagCounts: [], recentItems: [] })
    expect(prompt).toContain('(none)')
  })

  it('skips items with a null subject', () => {
    const prompt = buildEnvelopeIdeaPoolUserPrompt({
      categoryCounts: [],
      tagCounts: [],
      recentItems: [{ id: 'item-1', subject: null }],
    })
    expect(prompt).not.toContain('item-1')
  })
})
