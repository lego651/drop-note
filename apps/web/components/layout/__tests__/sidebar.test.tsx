/** @vitest-environment jsdom */

import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarNav } from '@/components/layout/sidebar'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/items',
}))

vi.mock('next/link', () => ({
  default: function MockLink({ children, href, ...props }: { children: ReactNode; href: string }) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const manyTags = Array.from({ length: 10 }, (_, i) => ({
  id: `tag-${i}`,
  name: `tag${i}`,
  item_count: 10 - i,
}))

describe('SidebarNav — top-N tags + show all', () => {
  it('shows only the first 8 tags and a "Show all" toggle when there are more than 8', () => {
    render(<SidebarNav userEmail="x@x.com" tags={manyTags} />)
    expect(screen.getByText('tag0')).toBeInTheDocument()
    expect(screen.getByText('tag7')).toBeInTheDocument()
    expect(screen.queryByText('tag8')).not.toBeInTheDocument()
    expect(screen.getByText('Show all (10)')).toBeInTheDocument()
  })

  it('reveals the rest of the tags when "Show all" is clicked, then can collapse again', () => {
    render(<SidebarNav userEmail="x@x.com" tags={manyTags} />)
    fireEvent.click(screen.getByText('Show all (10)'))
    expect(screen.getByText('tag9')).toBeInTheDocument()
    expect(screen.getByText('Show less')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Show less'))
    expect(screen.queryByText('tag9')).not.toBeInTheDocument()
  })

  it('does not render a toggle when there are 8 or fewer tags', () => {
    render(<SidebarNav userEmail="x@x.com" tags={manyTags.slice(0, 8)} />)
    expect(screen.queryByText(/Show all/)).not.toBeInTheDocument()
  })

  it('does not render the toggle when the sidebar is collapsed', () => {
    render(<SidebarNav userEmail="x@x.com" tags={manyTags} collapsed />)
    expect(screen.queryByText(/Show all/)).not.toBeInTheDocument()
  })
})
