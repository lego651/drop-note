import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { parseEnvelopeBody } from '@drop-note/shared'
import { EnvelopeBodyView } from '@/components/envelopes/EnvelopeBodyView'
import { GeneratingPoller } from '@/components/envelopes/GeneratingPoller'
import type { CitationLabels } from '@/components/envelopes/EnvelopeLeafRow'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Plan — drop-note' }
}

export default async function EnvelopeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: envelope } = await supabase
    .from('envelopes')
    .select('id, intent_input, status, body, error_message, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!envelope) notFound()

  const { data: linkedItems } = await supabase
    .from('envelope_items')
    .select('items(id, subject)')
    .eq('envelope_id', id)

  const citationLabels: CitationLabels = {}
  for (const row of linkedItems ?? []) {
    const item = Array.isArray(row.items) ? row.items[0] : row.items
    if (item) citationLabels[item.id] = item.subject ?? 'Untitled'
  }

  const intentInput = envelope.intent_input as { text?: string; purposeHint?: string | null } | null

  return (
    <div className="mx-auto max-w-3xl px-3 sm:px-6 lg:px-8 py-6 space-y-5">
      <Link href="/items" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} />
        Back to items
      </Link>

      <div>
        <h1 className="type-display text-[28px] leading-none text-foreground sm:text-[32px]">
          Your <span className="text-primary">plan</span>
        </h1>
        {intentInput?.text && (
          <p className="mt-2 text-[15px] text-muted-foreground">&ldquo;{intentInput.text}&rdquo;</p>
        )}
      </div>

      {envelope.status === 'generating' && (
        <>
          <GeneratingPoller envelopeId={envelope.id} />
          <div className="flex flex-col items-center gap-3 rounded-xl border-stroke border-ink bg-card py-16 text-center shadow-ink-lg">
            <Loader2 size={20} className="animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-foreground">Making your plan…</p>
          </div>
        </>
      )}

      {envelope.status === 'failed' && (
        <div
          className="rounded-xl border-stroke bg-card p-4 shadow-ink-lg"
          style={{ borderColor: 'hsl(var(--destructive))' }}
        >
          <p className="text-sm font-medium text-destructive-text">Couldn&apos;t make this plan.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {envelope.error_message ?? 'Something went wrong. Try again from the item selection.'}
          </p>
        </div>
      )}

      {(envelope.status === 'done' || envelope.status === 'partial') && (
        <>
          {envelope.status === 'partial' && (
            <p className="inline-flex items-center rounded-full border-stroke border-dashed border-ink/55 bg-card px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              Some lines couldn&apos;t be verified against your items
            </p>
          )}
          {(() => {
            const parsed = parseEnvelopeBody(envelope.body)
            if (!parsed.success) {
              return <p className="text-sm text-muted-foreground">This plan&apos;s content couldn&apos;t be read.</p>
            }
            return <EnvelopeBodyView body={parsed.data} citationLabels={citationLabels} />
          })()}
        </>
      )}
    </div>
  )
}
