/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EnvelopeMakePlanFab } from '../EnvelopeMakePlanFab'

describe('EnvelopeMakePlanFab (DRO-227)', () => {
  it('renders the pill and calls onClick', () => {
    const onClick = vi.fn()
    render(<EnvelopeMakePlanFab onClick={onClick} />)

    const button = screen.getByRole('button', { name: /Make a plan/ })
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalled()
  })
})
