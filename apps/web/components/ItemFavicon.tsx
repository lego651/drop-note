'use client'

import Image from 'next/image'
import { colorForTagHsl } from '@/lib/design-tokens'

interface ItemFaviconProps {
  sourceUrl?: string | null
  sourceType?: string | null
  size?: number
}

export function ItemFavicon({ sourceUrl, sourceType, size = 24 }: ItemFaviconProps) {
  // email with no URL: envelope icon via CSS character
  if (sourceType === 'email' && !sourceUrl) {
    return (
      <span
        className="shrink-0 flex items-center justify-center rounded"
        style={{
          width: size,
          height: size,
          backgroundColor: 'hsl(var(--color-source-email) / 0.15)',
          color: 'hsl(var(--color-source-email))',
          fontSize: size * 0.6,
        }}
        aria-hidden="true"
      >
        ✉
      </span>
    )
  }

  if (!sourceUrl) return null

  let domain = ''
  try {
    domain = new URL(sourceUrl).hostname
  } catch {
    return null
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  const initial = domain.replace('www.', '')[0]?.toUpperCase() ?? '?'
  const bgHsl = colorForTagHsl(domain)

  return (
    <span
      className="relative shrink-0 inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Letter fallback — shown behind img, visible if img fails to load */}
      <span
        className="absolute inset-0 flex items-center justify-center rounded"
        style={{
          backgroundColor: `hsl(${bgHsl} / 0.2)`,
          color: `hsl(${bgHsl})`,
          fontSize: size * 0.5,
          fontWeight: 500,
        }}
        aria-hidden="true"
      >
        {initial}
      </span>
      <Image
        src={faviconUrl}
        alt=""
        width={size}
        height={size}
        className="relative rounded"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none'
        }}
        unoptimized
      />
    </span>
  )
}
