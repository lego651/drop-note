/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/items',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

import { SidebarNav } from '../sidebar'

describe('Sidebar folders section', () => {
  it('renders a Folders section with folder names + counts', () => {
    render(
      <SidebarNav
        userEmail="a@b.com"
        folders={[{ id: 'f1', name: 'Sports', position: 0, item_count: 3 }]}
      />,
    )
    expect(screen.getByText('Folders')).toBeInTheDocument()
    expect(screen.getByText('Sports')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows an empty hint when there are no folders', () => {
    render(<SidebarNav userEmail="a@b.com" folders={[]} />)
    expect(screen.getByText('No folders yet')).toBeInTheDocument()
  })
})
