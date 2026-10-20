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
    expect(checkbox.className).toContain('after:-inset-[calc(14px+var(--stroke))]')
  })

  it('keeps the checkbox hit target within the row pitch, so adjacent rows cannot overlap', () => {
    // DRO-241/DRO-263: li is py-3 (12px top+bottom) around a text-sm line
    // (20px line-height) => 44px pitch. The checkbox sits mt-0.5 (2px) below
    // the content top, so its 16px *border-box* spans [14, 30] within the
    // row. But after:inset is measured from the checkbox's own padding box,
    // which border-stroke (1.5px, --stroke) shrinks on every side, so the
    // inset must add back --stroke to still land on exactly [0, 44] with
    // zero overlap into the neighbour above or below.
    const paddingY = 12
    const lineHeight = 20
    const rowPitch = paddingY * 2 + lineHeight
    const checkboxOffsetTop = 2
    const checkboxBorderBoxSize = 16
    const stroke = 1.5
    const checkboxPaddingBoxSize = checkboxBorderBoxSize - stroke * 2
    const insetY = 14 + stroke

    const paddingBoxTop = paddingY + checkboxOffsetTop + stroke
    const hitAreaTop = paddingBoxTop - insetY
    const hitAreaBottom = paddingBoxTop + checkboxPaddingBoxSize + insetY

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

  it('expands a citation chip\'s hit area to 44px tall without growing its visual pill (DRO-271)', () => {
    render(
      <EnvelopeLeafRow
        leaf={leaf({ sourceItemIds: ['item-1'], confidence: 'from_item' })}
        citationLabels={{ 'item-1': 'Packing list' }}
      />,
    )

    const chip = screen.getByRole('link', { name: 'Packing list' })
    // DRO-296 review: a px inset computed from an assumed 26px pill height
    // doesn't hold here — text-[11px] doesn't set its own line-height, and
    // the border-stroke padding-box shrink (the DRO-263 trap) makes the
    // actual rendered height unreliable. Use a fixed 44px overlay centered
    // on the pill instead, independent of its real height.
    expect(chip).toHaveClass('relative')
    expect(chip).toHaveClass('px-2')
    expect(chip).toHaveClass('py-0.5')
    expect(chip.className).not.toMatch(/\btruncate\b/)
    expect(chip.className).not.toMatch(/overflow-hidden/)
    expect(chip.className).toContain('after:inset-x-0')
    expect(chip.className).toContain('after:top-1/2')
    expect(chip.className).toContain('after:h-11')
    expect(chip.className).toContain('after:-translate-y-1/2')
  })
})

describe('EnvelopeLeafRow — editing on mobile (DRO-235)', () => {
  it('tapping the Save button commits an edit', () => {
    const onEditText = vi.fn()
    render(<EnvelopeLeafRow leaf={leaf()} citationLabels={{}} onEditText={onEditText} />)

    fireEvent.click(screen.getByText('Pack a towel'))
    const input = screen.getByDisplayValue('Pack a towel')
    fireEvent.change(input, { target: { value: 'Pack two towels' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save this line' }))

    expect(onEditText).toHaveBeenCalledWith('Pack two towels')
  })

  it('submitting the <form> (mobile keyboard Go/Done key) commits an edit', () => {
    const onEditText = vi.fn()
    render(<EnvelopeLeafRow leaf={leaf()} citationLabels={{}} onEditText={onEditText} />)

    fireEvent.click(screen.getByText('Pack a towel'))
    const input = screen.getByDisplayValue('Pack a towel')
    fireEvent.change(input, { target: { value: 'Pack two towels' } })
    fireEvent.submit(input.closest('form')!)

    expect(onEditText).toHaveBeenCalledWith('Pack two towels')
  })

  it('blurring away from the edit input commits a changed, non-empty value', () => {
    const onEditText = vi.fn()
    render(<EnvelopeLeafRow leaf={leaf()} citationLabels={{}} onEditText={onEditText} />)

    fireEvent.click(screen.getByText('Pack a towel'))
    const input = screen.getByDisplayValue('Pack a towel')
    fireEvent.change(input, { target: { value: 'Pack two towels' } })
    fireEvent.blur(input)

    expect(onEditText).toHaveBeenCalledWith('Pack two towels')
  })

  it('tapping Cancel discards the draft without committing', () => {
    const onEditText = vi.fn()
    render(<EnvelopeLeafRow leaf={leaf()} citationLabels={{}} onEditText={onEditText} />)

    fireEvent.click(screen.getByText('Pack a towel'))
    const input = screen.getByDisplayValue('Pack a towel')
    fireEvent.change(input, { target: { value: 'Discarded' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing this line' }))

    expect(onEditText).not.toHaveBeenCalled()
    expect(screen.getByText('Pack a towel')).toBeInTheDocument()
  })

  it('does not double-commit when a tap moves focus from the input to the Save button (blur fires first, then click)', () => {
    const onEditText = vi.fn()
    render(<EnvelopeLeafRow leaf={leaf()} citationLabels={{}} onEditText={onEditText} />)

    fireEvent.click(screen.getByText('Pack a towel'))
    const input = screen.getByDisplayValue('Pack a towel')
    fireEvent.change(input, { target: { value: 'Pack two towels' } })
    const saveButton = screen.getByRole('button', { name: 'Save this line' })
    // Browsers blur the input (relatedTarget = the element gaining focus) before
    // the click on that element fires — the component must recognize the Save
    // button as "still inside the form" and let the click's submit commit once,
    // not fire commit() a second time from the blur handler too.
    fireEvent.blur(input, { relatedTarget: saveButton })
    fireEvent.click(saveButton)

    expect(onEditText).toHaveBeenCalledTimes(1)
    expect(onEditText).toHaveBeenCalledWith('Pack two towels')
  })

  it('does not commit a discarded draft when a tap moves focus from the input to the Cancel button', () => {
    const onEditText = vi.fn()
    render(<EnvelopeLeafRow leaf={leaf()} citationLabels={{}} onEditText={onEditText} />)

    fireEvent.click(screen.getByText('Pack a towel'))
    const input = screen.getByDisplayValue('Pack a towel')
    fireEvent.change(input, { target: { value: 'Discarded' } })
    const cancelButton = screen.getByRole('button', { name: 'Cancel editing this line' })
    fireEvent.blur(input, { relatedTarget: cancelButton })
    fireEvent.click(cancelButton)

    expect(onEditText).not.toHaveBeenCalled()
    expect(screen.getByText('Pack a towel')).toBeInTheDocument()
  })

  it('suppresses the mousedown default on Save/Cancel so WebKit/Firefox (which report no relatedTarget on a button tap) never blur-commit before the click runs', () => {
    const onEditText = vi.fn()
    render(<EnvelopeLeafRow leaf={leaf()} citationLabels={{}} onEditText={onEditText} />)

    fireEvent.click(screen.getByText('Pack a towel'))
    const saveButton = screen.getByRole('button', { name: 'Save this line' })
    const cancelButton = screen.getByRole('button', { name: 'Cancel editing this line' })

    // fireEvent returns false when a handler called preventDefault() on a
    // cancelable event — this is the guard that stops the browser's default
    // "shift focus, which blurs the input" action on a button tap, so the
    // blur-commit handler never races the button's own click.
    expect(fireEvent.mouseDown(saveButton)).toBe(false)
    expect(fireEvent.mouseDown(cancelButton)).toBe(false)
  })
})
