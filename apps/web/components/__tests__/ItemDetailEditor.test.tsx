/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemDetailEditor } from '../ItemDetailEditor'

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
})

const tag = { id: 'tag-1', name: 'recipe' }

// DRO-247: the tag remove × was an 8x12 target and the Add button was 48x36
// — both need a >=44px effective tap target on mobile without growing the
// visible chip/button beyond what the design calls for.
describe('ItemDetailEditor tag tap targets (DRO-247)', () => {
  it('extends the tag remove button hit area via an invisible pseudo-element', () => {
    render(
      <ItemDetailEditor
        itemId="item-1"
        initialSummary=""
        initialNotes=""
        initialTags={[tag]}
        userTags={[tag]}
      />,
    )
    const remove = screen.getByRole('button', { name: 'Remove tag recipe' })
    expect(remove.className).toContain('after:-inset-2')
  })

  it('gives the Add tag button a 44px tap target on mobile that shrinks back at sm+', () => {
    render(
      <ItemDetailEditor
        itemId="item-1"
        initialSummary=""
        initialNotes=""
        initialTags={[]}
        userTags={[]}
      />,
    )
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add.className).toContain('h-11')
    expect(add.className).toContain('sm:h-9')
  })
})
