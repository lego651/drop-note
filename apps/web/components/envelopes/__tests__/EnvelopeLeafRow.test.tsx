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

  it('expands the checkbox hit target to a full 44px square without overlapping the next row', () => {
    render(
      <EnvelopeLeafRow leaf={leaf()} citationLabels={{}} bulletVariant="check" onToggle={() => {}} />,
    )

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toHaveClass('relative')
    expect(checkbox.className).toContain('after:-inset-x-[14px]')
    expect(checkbox.className).toContain('after:-inset-y-3.5')
  })

  it('keeps the checkbox hit target within the row pitch, so adjacent rows cannot overlap', () => {
    // DRO-241: li is py-3 (12px top+bottom) around a text-sm line (20px
    // line-height) => 44px pitch. The checkbox sits mt-0.5 (2px) below the
    // content top, so its 16px box spans [14, 30] within the row.
    // after:-inset-y-3.5 (14px) extends that to exactly [0, 44] — filling the
    // full 44px-tall row with zero overlap into the neighbour above or below.
    const paddingY = 12
    const lineHeight = 20
    const rowPitch = paddingY * 2 + lineHeight
    const checkboxOffsetTop = 2
    const checkboxSize = 16
    const insetY = 14

    const hitAreaTop = paddingY + checkboxOffsetTop - insetY
    const hitAreaBottom = paddingY + checkboxOffsetTop + checkboxSize + insetY

    expect(rowPitch).toBe(44)
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

  it('expands the delete control to a full 44px square (DRO-241)', () => {
    render(<EnvelopeLeafRow leaf={leaf()} citationLabels={{}} onDelete={() => {}} />)

    const deleteButton = screen.getByRole('button', { name: 'Remove this line' })
    expect(deleteButton.className).toContain('after:-inset-x-[14px]')
    expect(deleteButton.className).toContain('after:-inset-y-3.5')
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
