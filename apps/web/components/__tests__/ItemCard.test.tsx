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
})
