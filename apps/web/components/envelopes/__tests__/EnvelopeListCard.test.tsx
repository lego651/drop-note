/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EnvelopeListCard } from '../EnvelopeListCard'
import type { EnvelopeListItem } from '@/lib/envelopes'

function makeEnvelope(overrides: Partial<EnvelopeListItem> = {}): EnvelopeListItem {
  return {
    id: 'env-1',
    title: 'Weekend plan',
    intentText: 'Plan my weekend',
    status: 'done',
    progress: { checked: 3, total: 12 },
    createdAt: '2026-10-18T00:00:00Z',
    sourceItemCount: 5,
    ...overrides,
  }
}

describe('EnvelopeListCard (DRO-223)', () => {
  it('links to the envelope detail page', () => {
    render(<EnvelopeListCard envelope={makeEnvelope()} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/envelopes/env-1')
  })

  it('shows title, intent text, status, progress, and source item count', () => {
    render(<EnvelopeListCard envelope={makeEnvelope()} />)
    expect(screen.getByText('Weekend plan')).toBeInTheDocument()
    expect(screen.getByText('“Plan my weekend”')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('3/12 DONE')).toBeInTheDocument()
    expect(screen.getByText('5 items')).toBeInTheDocument()
  })

  it('omits the progress segment when there is none', () => {
    render(<EnvelopeListCard envelope={makeEnvelope({ progress: null })} />)
    expect(screen.queryByText(/DONE/)).not.toBeInTheDocument()
  })

  it('uses singular "item" for a single source item', () => {
    render(<EnvelopeListCard envelope={makeEnvelope({ sourceItemCount: 1 })} />)
    expect(screen.getByText('1 item')).toBeInTheDocument()
  })
})
