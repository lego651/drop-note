/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemCategorySection } from '../ItemCategorySection'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const category = { id: 'cat-food', name: 'Food & Drink', position: 0, is_other: false }
const categories = [{ id: 'cat-food', name: 'Food & Drink', position: 0, hidden: false, is_default: true, is_other: false }]

describe('ItemCategorySection', () => {
  it('renders the Category label and the lg badge/picker when a category is assigned', () => {
    render(
      <ItemCategorySection
        itemId="item-1"
        category={category}
        locked
        isProcessing={false}
        categories={categories}
      />,
    )
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Category: Food & Drink/ })).toBeInTheDocument()
    expect(screen.getByText(/Set by you/)).toBeInTheDocument()
  })

  it('shows a skeleton while the item is still processing and has no category yet', () => {
    render(
      <ItemCategorySection
        itemId="item-1"
        category={null}
        locked={false}
        isProcessing
        categories={categories}
      />,
    )
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders nothing when there is no category and the item is not processing (e.g. failed)', () => {
    const { container } = render(
      <ItemCategorySection
        itemId="item-1"
        category={null}
        locked={false}
        isProcessing={false}
        categories={categories}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
