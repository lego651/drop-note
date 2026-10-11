/** @vitest-environment jsdom */

import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItemCard } from '@/components/ItemCard'
import type { ItemSummary } from '@/lib/items'
import * as openExternal from '@/lib/open-external'

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
  default: function MockLink({
    children,
    href,
    ...props
  }: {
    children: ReactNode
    href: string
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

const base: ItemSummary = {
  id: 'item-1',
  subject: 'Test subject',
  sender_email: 'a@b.com',
  ai_summary: 'Summary text',
  status: 'done',
  error_message: null,
  pinned: false,
  created_at: '2026-01-15T12:00:00.000Z',
  source_type: 'youtube',
  source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  thumbnail_url: 'https://example.com/thumb.jpg',
  item_tags: [],
}

describe('ItemCard', () => {
  let openSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    openSpy = vi.spyOn(openExternal, 'openExternalUrl').mockImplementation(() => {})
  })

  afterEach(() => {
    openSpy.mockRestore()
  })

  it('does not nest links: one navigation link and YouTube opens via button', () => {
    render(<ItemCard item={base} />)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/items/item-1')

    const yt = screen.getByRole('button', { name: 'Open on YouTube' })
    expect(yt).toBeInTheDocument()
  })

  it('calls openExternalUrl when the YouTube control is activated', () => {
    render(<ItemCard item={base} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open on YouTube' }))

    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    )
  })

  it('renders an "Open original" control for a generic url item', () => {
    const urlItem: ItemSummary = {
      ...base,
      source_type: 'url',
      source_url: 'https://www.reddit.com/r/programming/comments/1a2b3c4/some_thread/',
    }
    render(<ItemCard item={urlItem} />)

    const link = screen.getByRole('button', { name: 'Open original' })
    expect(link).toBeInTheDocument()

    fireEvent.click(link)
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.reddit.com/r/programming/comments/1a2b3c4/some_thread/',
    )
  })

  it('renders the thumbnail via next/image for a youtube item', () => {
    render(<ItemCard item={base} />)

    const thumb = screen.getByAltText('Test subject')
    expect(thumb).toHaveAttribute('src', 'https://example.com/thumb.jpg')
  })

  it('renders the thumbnail via a plain <img> (not next/image) for a generic url item, since og:image hosts are not in the next/image allowlist', () => {
    const urlItem: ItemSummary = {
      ...base,
      source_type: 'url',
      source_url: 'https://www.reddit.com/r/programming/comments/1a2b3c4/some_thread/',
      thumbnail_url: 'https://arbitrary-blog-host.example/og.jpg',
      subject: null,
    }
    render(<ItemCard item={urlItem} />)

    const thumb = screen.getByAltText('')
    expect(thumb).toHaveAttribute('src', 'https://arbitrary-blog-host.example/og.jpg')
    expect(thumb).toHaveAttribute('loading', 'lazy')
  })

  it('does not render an external-link control when source_url is null', () => {
    const emailItem: ItemSummary = {
      ...base,
      source_type: 'email',
      source_url: null,
    }
    render(<ItemCard item={emailItem} />)

    expect(screen.queryByRole('button', { name: 'Open original' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open on YouTube' })).toBeNull()
  })

  it('does not wrap the card in a link while the item is still processing', () => {
    const processing: ItemSummary = {
      ...base,
      status: 'processing',
      source_type: null,
      source_url: null,
    }
    render(<ItemCard item={processing} />)

    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders a source dot with a background color', () => {
    const { container } = render(<ItemCard item={base} />)
    // Source dot is an aria-hidden span with a backgroundColor style
    const dot = container.querySelector('[aria-hidden="true"][style*="background"]')
    expect(dot).toBeTruthy()
  })

  it('renders source dot for youtube source type', () => {
    const { container } = render(<ItemCard item={{ ...base, source_type: 'youtube' }} />)
    const dot = container.querySelector('[aria-hidden="true"][style*="background"]')
    expect(dot).toBeTruthy()
  })

  it('renders source dot for email source type', () => {
    const emailItem: ItemSummary = {
      ...base,
      source_type: 'email',
      source_url: null,
      thumbnail_url: null,
    }
    const { container } = render(<ItemCard item={emailItem} />)
    const dot = container.querySelector('[aria-hidden="true"][style*="background"]')
    expect(dot).toBeTruthy()
  })

  it('shows read time for done items with ai_summary', () => {
    render(<ItemCard item={{ ...base, ai_summary: 'A '.repeat(200) }} />)
    expect(screen.getByText(/min read/)).toBeInTheDocument()
  })

  it('does not show read time for processing items', () => {
    render(<ItemCard item={{ ...base, status: 'processing', ai_summary: null }} />)
    expect(screen.queryByText(/min read/)).toBeNull()
  })
})
