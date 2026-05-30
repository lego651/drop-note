/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TagRow } from '@/components/TagRow'

const tags = [
  { id: '1', name: 'ai' },
  { id: '2', name: 'research' },
  { id: '3', name: 'tools' },
]

describe('TagRow', () => {
  it('renders all tag names', () => {
    const { getByText } = render(<TagRow tags={tags} />)
    expect(getByText('#ai')).toBeInTheDocument()
    expect(getByText('#research')).toBeInTheDocument()
    expect(getByText('#tools')).toBeInTheDocument()
  })

  it('returns empty flex spacer when tags array is empty', () => {
    const { container } = render(<TagRow tags={[]} />)
    expect(container.firstChild).toHaveClass('flex-1')
  })

  it('each tag has an inline color style (not uniform bg-secondary)', () => {
    const { container } = render(<TagRow tags={tags} />)
    const spans = container.querySelectorAll('span[style]')
    expect(spans.length).toBeGreaterThanOrEqual(tags.length)
    // Each should have backgroundColor set
    spans.forEach((span) => {
      expect((span as HTMLElement).style.backgroundColor).toBeTruthy()
    })
  })

  it('same tag name always produces the same color (deterministic)', () => {
    const singleTag = [{ id: 'x', name: 'deterministic-tag' }]
    const { container: c1 } = render(<TagRow tags={singleTag} />)
    const { container: c2 } = render(<TagRow tags={singleTag} />)
    const style1 = (c1.querySelector('span[style]') as HTMLElement)?.style.backgroundColor
    const style2 = (c2.querySelector('span[style]') as HTMLElement)?.style.backgroundColor
    expect(style1).toBe(style2)
    expect(style1).toBeTruthy()
  })

  it('different tag names may produce different colors', () => {
    const differentTags = [
      { id: '1', name: 'alpha' },
      { id: '2', name: 'beta' },
    ]
    const { container } = render(<TagRow tags={differentTags} />)
    const spans = Array.from(container.querySelectorAll('span[style]')) as HTMLElement[]
    expect(spans).toHaveLength(2)
    // Colors might differ (not a hard guarantee since hash could collide on 2 items)
    // Just verify both have color styles set
    expect(spans[0].style.backgroundColor).toBeTruthy()
    expect(spans[1].style.backgroundColor).toBeTruthy()
  })
})
