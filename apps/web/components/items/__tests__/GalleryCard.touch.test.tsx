/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { GalleryCard } from '../GalleryCard'
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
// hover, so they need to be reachable (and a big-enough tap target) on touch.
describe('GalleryCard — pin/delete reachable on touch', () => {
  it('renders pin and delete with the touch-visible, 44px-tap-target classes', () => {
    render(<GalleryCard item={item} />)

    const pinButton = screen.getByRole('button', { name: 'Pin item' })
    const deleteButton = screen.getByRole('button', { name: 'Delete item' })

    for (const button of [pinButton, deleteButton]) {
      expect(button.className).toContain('[@media(hover:none)]:h-11')
      expect(button.className).toContain('[@media(hover:none)]:w-11')
    }

    // The wrapper must force full opacity when the device has no hover (touch),
    // not just on `:hover` / `group-hover`, or the buttons stay invisible on phones.
    expect(pinButton.parentElement?.className).toContain('[@media(hover:none)]:opacity-100')
  })

  it('does not render pin/delete while in bulk-select mode (checkbox takes over)', () => {
    render(<GalleryCard item={item} isBulkMode />)

    expect(screen.queryByRole('button', { name: 'Pin item' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete item' })).toBeNull()
  })
})
