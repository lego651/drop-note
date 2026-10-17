/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CategoryBadge } from '../CategoryBadge'

const category = { id: 'cat-1', name: 'Food & Drink', position: 0, is_other: false }

describe('CategoryBadge', () => {
  it('renders as a static, non-interactive span by default', () => {
    render(<CategoryBadge category={category} />)
    expect(screen.getByText('Food & Drink')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders as an interactive button with an accessible label when interactive', () => {
    render(<CategoryBadge category={category} interactive />)
    const button = screen.getByRole('button', { name: 'Category: Food & Drink. Change category' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('forwards onClick for interactive badges (card event isolation)', () => {
    const onClick = vi.fn()
    render(<CategoryBadge category={category} interactive onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('truncates long names rather than overflowing', () => {
    const longName = 'Supercalifragilisticexpialidociousrecipes'
    render(<CategoryBadge category={{ ...category, name: longName }} />)
    expect(screen.getByText(longName)).toHaveClass('truncate')
  })
})
