/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
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

const youtubeItem: ItemSummary = {
  ...item,
  source_type: 'youtube',
  source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  thumbnail_url: 'https://example.com/thumb.jpg',
}

// DRO-240: the pin/delete controls must not rely on :hover alone — phones have no
// hover, so they need to be reachable (and a big-enough tap target) on touch, without
// permanently covering the title text or the YouTube play button.
//
// There are two separate control groups in the DOM:
// - `touch-controls-overlay`: sm+ only, absolutely positioned over the (148px) thumbnail.
//   On mouse it's hover-revealed; on touch devices at sm+ it's forced visible.
// - `touch-controls-mobile`: below sm only, a normal-flow row next to the meta line. Below
//   sm the thumbnail shrinks to 64px (DRO-251), too small for any 44px button to avoid the
//   centred play button, so mobile can't use the overlay at all (DRO-240 round 4).
describe('ListCard — pin/delete reachable on touch', () => {
  it('sm+ overlay: renders pin and delete with the touch-visible, 44px-tap-target classes', () => {
    render(<ListCard item={item} />)

    const overlay = screen.getByTestId('touch-controls-overlay')
    const pinButton = within(overlay).getByRole('button', { name: 'Pin item' })
    const deleteButton = within(overlay).getByRole('button', { name: 'Delete item' })

    for (const button of [pinButton, deleteButton]) {
      expect(button.className).toContain('[@media(hover:none)]:h-11')
      expect(button.className).toContain('[@media(hover:none)]:w-11')
    }

    expect(overlay.className).toContain('[@media(hover:none)]:opacity-100')
    // Hidden by default (mobile); only shown as a flex row from sm up, where the
    // 148px thumbnail has room for it.
    expect(overlay.className).toContain('hidden')
    expect(overlay.className).toContain('sm:flex')
  })

  it('sm+ overlay: sits over the thumbnail, not the title, so it never covers the item title', () => {
    render(<ListCard item={item} />)

    const overlay = screen.getByTestId('touch-controls-overlay')
    const title = screen.getByText('Test subject')

    // The overlay's positioning ancestor must be the media wrapper, which is a
    // sibling of (not an ancestor of) the title's container.
    const mediaWrapper = overlay.closest('.relative.shrink-0')
    expect(mediaWrapper).not.toBeNull()
    expect(mediaWrapper?.contains(title)).toBe(false)
  })

  it('sm+ overlay: stacks pin/delete vertically on touch so they stay clear of the centred YouTube play button', () => {
    render(<ListCard item={youtubeItem} />)

    const overlay = screen.getByTestId('touch-controls-overlay')

    // Side-by-side (row) controls sit near the thumbnail's horizontal center and
    // overlap the play button's tap target; stacking them in a column keeps the
    // whole 44px column to the right of the centred play button instead (at the sm+
    // 148px thumbnail width where the overlay renders).
    expect(overlay.className).toContain('[@media(hover:none)]:flex-col')

    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument()
  })

  it('sm+ overlay: stays outside the clipped (overflow-hidden) thumbnail box, so DRO-251\'s 64px mobile thumbnail never clips it', () => {
    render(<ListCard item={item} />)

    const overlay = screen.getByTestId('touch-controls-overlay')
    const mediaWrapper = overlay.closest('.relative.shrink-0')

    // The overlay's own positioning ancestor must not be the overflow-hidden thumbnail
    // box — if it were, the stacked 44px pair (~92px tall) would get clipped by the
    // mobile 64px-tall thumbnail.
    expect(overlay.className).not.toContain('overflow-hidden')
    expect(mediaWrapper?.className).not.toContain('overflow-hidden')

    // At sm+ the media wrapper reserves at least 104px of layout height regardless of
    // the thumbnail's own (possibly smaller) box, so the stacked buttons stay within
    // this card instead of overflowing into the next one.
    expect(mediaWrapper?.className).toContain('min-h-[104px]')
  })

  it('mobile row: renders pin and delete as always-visible 44px buttons, not an overlay', () => {
    render(<ListCard item={item} />)

    const mobileRow = screen.getByTestId('touch-controls-mobile')
    const pinButton = within(mobileRow).getByRole('button', { name: 'Pin item' })
    const deleteButton = within(mobileRow).getByRole('button', { name: 'Delete item' })

    for (const button of [pinButton, deleteButton]) {
      expect(button.className).toContain('h-11')
      expect(button.className).toContain('w-11')
      // Always visible below sm — no opacity-0/hover gating like the sm+ overlay.
      expect(button.className).not.toContain('opacity-0')
    }

    // Only shown below sm; the sm+ overlay takes over once the thumbnail is big enough.
    expect(mobileRow.className).toContain('sm:hidden')
    expect(mobileRow.className).not.toContain('absolute')
  })

  it('mobile row: lives in the meta line (not on the thumbnail), so it can never overlap the play button', () => {
    render(<ListCard item={youtubeItem} />)

    const mobileRow = screen.getByTestId('touch-controls-mobile')
    const mediaWrapper = screen.getByTestId('touch-controls-overlay').closest('.relative.shrink-0')
    const playButton = screen.getByRole('button', { name: 'Play video' })

    // The mobile control row must not be a descendant of the thumbnail/media wrapper —
    // any 44px button placed inside the 64px mobile thumbnail would unavoidably overlap
    // the centred play button (DRO-240 round 4), so it has to live outside it entirely.
    expect(mediaWrapper?.contains(mobileRow)).toBe(false)
    expect(mediaWrapper?.contains(playButton)).toBe(true)
  })

  it('does not render pin/delete (either group) while in bulk-select mode (checkbox takes over)', () => {
    render(<ListCard item={item} isBulkMode />)

    expect(screen.queryByTestId('touch-controls-overlay')).toBeNull()
    expect(screen.queryByTestId('touch-controls-mobile')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pin item' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete item' })).toBeNull()
  })
})
