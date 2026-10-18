/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
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

  it('expands the checkbox hit target well beyond its visual 16px box', () => {
    render(
      <EnvelopeLeafRow leaf={leaf()} citationLabels={{}} bulletVariant="check" onToggle={() => {}} />,
    )

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toHaveClass('relative')
    expect(checkbox.className).toContain("after:-inset-[14px]")
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
