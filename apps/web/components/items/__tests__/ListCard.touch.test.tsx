/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { ListCard } from '../ListCard'
import type { ItemSummary } from '@/lib/items'

vi.mock('@/components/VideoModal', () => ({
  VideoModal: () => null,
}))

vi.mock('next/image', () => ({
  default: function MockImage({ src, alt, ...rest }: { src: string; alt: string }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...rest} />
  },
}))

vi.mock('next/link', () => ({
  default: function MockLink({ children, href, ...props }: { children: ReactNode; href: string }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

const item: ItemSummary = {
  id: 'item-1',
  subject: 'Test subject',
  sender_email: 'a@b.com',
  ai_summary: 'Summary text',
  status: 'done',
  error_message: null,
  pinned: false,
  created_at: '2026-01-15T12:00:00.000Z',
  source_type: 'email',
  source_url: null,
  thumbnail_url: null,
  item_tags: [],
}

// DRO-240: the pin/delete controls must not rely on :hover alone — phones have no
// hover, so they need to be reachable (and a big-enough tap target) on touch, without
// permanently covering the title text.
describe('ListCard — pin/delete reachable on touch', () => {
  it('renders pin and delete with the touch-visible, 44px-tap-target classes', () => {
    render(<ListCard item={item} />)

    const pinButton = screen.getByRole('button', { name: 'Pin item' })
    const deleteButton = screen.getByRole('button', { name: 'Delete item' })

    for (const button of [pinButton, deleteButton]) {
      expect(button.className).toContain('[@media(hover:none)]:h-11')
      expect(button.className).toContain('[@media(hover:none)]:w-11')
    }

    expect(pinButton.parentElement?.className).toContain('[@media(hover:none)]:opacity-100')
  })

  it('sits over the thumbnail, not the title, so it never covers the item title', () => {
    render(<ListCard item={item} />)

    const pinButton = screen.getByRole('button', { name: 'Pin item' })
    const title = screen.getByText('Test subject')

    // The button's positioning ancestor must be the thumbnail wrapper, which is a
    // sibling of (not an ancestor of) the title's container.
    const thumbnailWrapper = pinButton.closest('.relative.h-\\[104px\\]')
    expect(thumbnailWrapper).not.toBeNull()
    expect(thumbnailWrapper?.contains(title)).toBe(false)
  })

  it('does not render pin/delete while in bulk-select mode (checkbox takes over)', () => {
    render(<ListCard item={item} isBulkMode />)

    expect(screen.queryByRole('button', { name: 'Pin item' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete item' })).toBeNull()
  })

  it('stacks pin/delete vertically on touch so they stay clear of the centred YouTube play button', () => {
    const youtubeItem: ItemSummary = {
      ...item,
      source_type: 'youtube',
      source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnail_url: 'https://example.com/thumb.jpg',
    }
    render(<ListCard item={youtubeItem} />)

    const pinButton = screen.getByRole('button', { name: 'Pin item' })
    const controlsWrapper = pinButton.parentElement

    // Side-by-side (row) controls sit near the thumbnail's horizontal center and
    // overlap the play button's tap target; stacking them in a column keeps the
    // whole 44px column to the right of the centred play button instead.
    expect(controlsWrapper?.className).toContain('[@media(hover:none)]:flex-col')

    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument()
  })
})
