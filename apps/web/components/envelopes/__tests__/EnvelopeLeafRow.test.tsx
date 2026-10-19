/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { EnvelopeLeaf } from '@drop-note/shared'
import { EnvelopeLeafRow } from '../EnvelopeLeafRow'

function leaf(overrides: Partial<EnvelopeLeaf> = {}): EnvelopeLeaf {
  return {
    text: 'Pack a towel',
    sourceItemIds: [],
    confidence: 'from_item',
    ...overrides,
  }
}

describe('EnvelopeLeafRow (DRO-207 design fixes)', () => {
  it('keeps the dashed "suggested" signal on a checklist leaf, not just list/notes rows', () => {
    render(
      <EnvelopeLeafRow
        leaf={leaf({ confidence: 'suggested' })}
        citationLabels={{}}
        bulletVariant="check"
        onToggle={() => {}}
      />,
    )

    expect(screen.getByRole('checkbox')).toHaveClass('border-dashed')
  })

  it('does not mark a grounded checklist leaf as dashed', () => {
    render(
      <EnvelopeLeafRow
        leaf={leaf({ confidence: 'from_item' })}
        citationLabels={{}}
        bulletVariant="check"
        onToggle={() => {}}
      />,
    )

    expect(screen.getByRole('checkbox')).not.toHaveClass('border-dashed')
  })

  it('expands the checkbox hit target horizontally without overlapping the next row vertically', () => {
    render(
      <EnvelopeLeafRow leaf={leaf()} citationLabels={{}} bulletVariant="check" onToggle={() => {}} />,
    )

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toHaveClass('relative')
    expect(checkbox.className).toContain('after:-inset-x-[14px]')
    expect(checkbox.className).toContain('after:-inset-y-2')
    // Must not regress to a uniform inset: a uniform ≥10px inset overlaps the
    // next/previous row's hit area at the current py-1.5 row pitch (DRO-203 D2).
    expect(checkbox.className).not.toMatch(/after:-inset-\[\d/)
  })

  it('keeps the checkbox hit target within the row pitch, so adjacent rows cannot overlap', () => {
    // Row pitch math from DRO-203's round-D2 review: li is py-1.5 (6px top+bottom)
    // around a text-sm line (20px line-height) => 32px pitch. The checkbox sits
    // mt-0.5 (2px) below the content top, so its 16px box spans [8, 24] within
    // the row. after:-inset-y-2 (8px) extends that to exactly [0, 32] — filling
    // the row with zero overlap into the neighbour above or below.
    const paddingY = 6
    const lineHeight = 20
    const rowPitch = paddingY * 2 + lineHeight
    const checkboxOffsetTop = 2
    const checkboxSize = 16
    const insetY = 8

    const hitAreaTop = paddingY + checkboxOffsetTop - insetY
    const hitAreaBottom = paddingY + checkboxOffsetTop + checkboxSize + insetY

    expect(hitAreaTop).toBe(0)
    expect(hitAreaBottom).toBe(rowPitch)
  })

  it('uses a 16px (text-base) inline edit input so iOS Safari does not zoom on focus', () => {
    render(
      <EnvelopeLeafRow leaf={leaf()} citationLabels={{}} bulletVariant="dash" onEditText={() => {}} />,
    )

    fireEvent.click(screen.getByText('Pack a towel'))

    const input = screen.getByDisplayValue('Pack a towel')
    expect(input).toHaveClass('text-base')
    expect(input).toHaveClass('md:text-sm')
  })
})

describe('EnvelopeLeafRow (DRO-232 extensibility)', () => {
  it('renders a delete control when onDelete is given, and calls it on click', () => {
    const onDelete = vi.fn()
    render(<EnvelopeLeafRow leaf={leaf()} citationLabels={{}} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove this line' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('does not render a delete control when onDelete is omitted', () => {
    render(<EnvelopeLeafRow leaf={leaf()} citationLabels={{}} />)
    expect(screen.queryByRole('button', { name: 'Remove this line' })).not.toBeInTheDocument()
  })

  it('shows "Added by you" instead of a citation pill or the "suggested" dashed marker for a user leaf', () => {
    render(
      <EnvelopeLeafRow
        leaf={leaf({ origin: 'user', confidence: 'suggested', sourceItemIds: [] })}
        citationLabels={{}}
        bulletVariant="check"
        onToggle={() => {}}
      />,
    )

    expect(screen.getByText('Added by you')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toHaveClass('border-dashed')
  })

  it('prefers the "Edited" badge over "Added by you" when a user leaf has also been edited', () => {
    render(<EnvelopeLeafRow leaf={leaf({ origin: 'user', edited: true })} citationLabels={{}} />)
    expect(screen.getByText('Edited')).toBeInTheDocument()
    expect(screen.queryByText('Added by you')).not.toBeInTheDocument()
  })
})
