'use client'

import Image from 'next/image'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ItemThumbnailProps {
  thumbnailUrl: string
  subject: string | null
  youtubeId: string | null
  isListView: boolean
  onVideoOpen: () => void
}

export function ItemThumbnail({
  thumbnailUrl,
  subject,
  youtubeId,
  isListView,
  onVideoOpen,
}: ItemThumbnailProps) {
  const className = cn(
    'relative shrink-0 overflow-hidden rounded-md bg-muted',
    isListView
      ? 'w-28 h-20 sm:w-36 sm:h-24'
      : 'w-full aspect-video',
    youtubeId && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  )

  const imageEl = (
    <Image
      src={thumbnailUrl}
      alt={subject ?? 'Video thumbnail'}
      fill
      className="object-cover"
      sizes="(max-width: 640px) 112px, 144px"
    />
  )

  if (youtubeId) {
    return (
      <button
        type="button"
        aria-label="Watch video"
        className={className}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onVideoOpen()
        }}
      >
        {imageEl}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-background/80 p-1.5 group-hover:scale-110 transition-transform">
            <Play size={12} className="fill-foreground text-foreground" />
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className={className}>
      {imageEl}
    </div>
  )
}
