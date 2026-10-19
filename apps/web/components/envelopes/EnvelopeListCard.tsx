import Link from 'next/link'
import { Mail } from 'lucide-react'
import { EnvelopeStatusPill } from '@/components/envelopes/EnvelopeStatusPill'
import type { EnvelopeListItem } from '@/lib/envelopes'

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export function EnvelopeListCard({ envelope }: { envelope: EnvelopeListItem }) {
  return (
    <Link href={`/envelopes/${envelope.id}`} className="block">
      <article className="lift flex items-start gap-4 rounded-xl border-stroke border-ink bg-card p-4 shadow-ink-lg">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-stroke border-ink bg-card text-muted-foreground">
          <Mail size={16} />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold leading-snug text-foreground">{envelope.title}</h3>
            <EnvelopeStatusPill status={envelope.status} />
          </div>

          <p className="line-clamp-1 text-sm text-muted-foreground">&ldquo;{envelope.intentText}&rdquo;</p>

          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
            {envelope.progress && (
              <>
                <span>
                  {envelope.progress.checked}/{envelope.progress.total} DONE
                </span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>
              {envelope.sourceItemCount} {envelope.sourceItemCount === 1 ? 'item' : 'items'}
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime={envelope.createdAt}>{formatDate(envelope.createdAt)}</time>
          </div>
        </div>
      </article>
    </Link>
  )
}
