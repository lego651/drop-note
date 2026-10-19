/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EnvelopesEmptyState, ENVELOPES_EMPTY_STATE_COPY } from '../EnvelopesEmptyState'

describe('EnvelopesEmptyState (DRO-223, CTA relabeled DRO-227)', () => {
  it('shows the placeholder copy and a "Make a plan" link that drops the user into pick mode on /items', () => {
    render(<EnvelopesEmptyState />)

    expect(screen.getByText(ENVELOPES_EMPTY_STATE_COPY)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Make a plan' })
    expect(link).toHaveAttribute('href', '/items?pick=1')
  })
})
