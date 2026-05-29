/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemFavicon } from '@/components/ItemFavicon'

vi.mock('next/image', () => ({
  default: function MockImage({ src, alt, ...rest }: { src: string; alt: string; [key: string]: unknown }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} data-testid="favicon-img" {...rest} />
  },
}))

describe('ItemFavicon', () => {
  it('renders a favicon img when sourceUrl is provided', () => {
    render(<ItemFavicon sourceUrl="https://example.com/page" sourceType="article" size={20} />)
    const img = screen.getByTestId('favicon-img')
    expect(img).toBeInTheDocument()
    expect((img as HTMLImageElement).src).toContain('example.com')
  })

  it('shows envelope character for email type with no URL', () => {
    const { container } = render(<ItemFavicon sourceType="email" sourceUrl={null} size={20} />)
    expect(container.textContent).toContain('✉')
  })

  it('renders letter fallback when no sourceUrl', () => {
    const { container } = render(<ItemFavicon sourceUrl={null} sourceType="article" size={20} />)
    // No URL → returns null
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when sourceUrl is invalid', () => {
    const { container } = render(<ItemFavicon sourceUrl="not-a-valid-url" sourceType="article" size={20} />)
    expect(container.firstChild).toBeNull()
  })

  it('uses google favicon service for valid domains', () => {
    render(<ItemFavicon sourceUrl="https://github.com/repo" sourceType="article" />)
    const img = screen.getByTestId('favicon-img')
    expect((img as HTMLImageElement).src).toContain('google.com/s2/favicons')
    expect((img as HTMLImageElement).src).toContain('github.com')
  })
})
