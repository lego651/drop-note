/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemsPageHeader } from '../ItemsPageHeader'

// next/image renders as <img> in tests
vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: { src: string; alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...rest} />
  ),
}))

describe('ItemsPageHeader', () => {
  it('renders the drop-note wordmark', () => {
    render(
      <ItemsPageHeader
        avatarUrl={null}
        userInitials="J"
        avatarColor="214 89% 52%"
      />
    )
    expect(screen.getByText('drop-note')).toBeDefined()
  })

  it('renders the bell icon with aria-label', () => {
    render(
      <ItemsPageHeader
        avatarUrl={null}
        userInitials="J"
        avatarColor="214 89% 52%"
      />
    )
    expect(screen.getByLabelText('Notifications')).toBeDefined()
  })

  it('renders an img when avatarUrl is provided', () => {
    render(
      <ItemsPageHeader
        avatarUrl="https://lh3.googleusercontent.com/photo.jpg"
        userInitials="JG"
        avatarColor="214 89% 52%"
      />
    )
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toContain('lh3.googleusercontent.com')
  })

  it('renders initials text when avatarUrl is null', () => {
    render(
      <ItemsPageHeader
        avatarUrl={null}
        userInitials="JG"
        avatarColor="214 89% 52%"
      />
    )
    expect(screen.getByText('JG')).toBeDefined()
  })

  it('does not throw when avatarUrl is null', () => {
    expect(() =>
      render(
        <ItemsPageHeader
          avatarUrl={null}
          userInitials="U"
          avatarColor="214 89% 52%"
        />
      )
    ).not.toThrow()
  })

  it('renders single initial for single-char initials', () => {
    render(
      <ItemsPageHeader
        avatarUrl={null}
        userInitials="J"
        avatarColor="270 60% 55%"
      />
    )
    expect(screen.getByText('J')).toBeDefined()
  })
})
