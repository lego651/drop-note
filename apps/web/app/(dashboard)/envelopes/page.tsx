import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { buildEnvelopeListItem, type EnvelopeListRow } from '@/lib/envelopes'
import { EnvelopeListCard } from '@/components/envelopes/EnvelopeListCard'
import { EnvelopesEmptyState } from '@/components/envelopes/EnvelopesEmptyState'

export const metadata: Metadata = { title: 'Plans — drop-note' }

// Bounds the list query so a user with an unusually large history of
// generated plans can't turn this page into an unbounded fetch (DRO-223).
const ENVELOPES_LIST_LIMIT = 100

export default async function EnvelopesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rawEnvelopes } = await supabase
    .from('envelopes')
    .select('id, intent_input, status, body, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(ENVELOPES_LIST_LIMIT)

  const envelopeIds = rawEnvelopes?.map((row) => row.id) ?? []

  // One bulk query for every envelope's linked item count rather than one
  // query per envelope — bounded by ENVELOPES_LIST_LIMIT * ENVELOPE_MAX_ITEMS,
  // cheap to count client-side.
  const sourceItemCounts = new Map<string, number>()
  if (envelopeIds.length > 0) {
    const { data: links } = await supabase
      .from('envelope_items')
      .select('envelope_id')
      .in('envelope_id', envelopeIds)
    for (const link of links ?? []) {
      sourceItemCounts.set(link.envelope_id, (sourceItemCounts.get(link.envelope_id) ?? 0) + 1)
    }
  }

  const envelopes = (rawEnvelopes ?? [])
    .map((row) => buildEnvelopeListItem(row as EnvelopeListRow, sourceItemCounts.get(row.id) ?? 0))
    .filter((item): item is NonNullable<typeof item> => item !== null)

  return (
    <div className="mx-auto max-w-3xl px-3 sm:px-6 lg:px-8 py-6 space-y-5">
      <div>
        <h1 className="type-display text-[28px] leading-none text-foreground sm:text-[32px]">Your plans</h1>
        <p className="mt-2 text-sm text-muted-foreground">Checklists, lists and notes made from your saved items.</p>
      </div>

      {envelopes.length === 0 ? (
        <EnvelopesEmptyState />
      ) : (
        <ul className="space-y-2.5">
          {envelopes.map((envelope) => (
            <li key={envelope.id}>
              <EnvelopeListCard envelope={envelope} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
