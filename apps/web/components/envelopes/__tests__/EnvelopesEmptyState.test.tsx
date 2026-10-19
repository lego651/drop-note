/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EnvelopesEmptyState, ENVELOPES_EMPTY_STATE_COPY } from '../EnvelopesEmptyState'

describe('EnvelopesEmptyState (DRO-223)', () => {
  it('shows the placeholder copy and a link back to /items', () => {
    render(<EnvelopesEmptyState />)

    expect(screen.getByText(ENVELOPES_EMPTY_STATE_COPY)).toBeInTheDocument()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/items')
  })
})
