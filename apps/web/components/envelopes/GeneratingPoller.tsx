'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const POLL_INTERVAL_MS = 2000

// The generate route has maxDuration=60. If a serverless function is ever
// hard-killed before it writes a terminal status, the row stays "generating"
// forever and polling it would never resolve — give up a bit past the
// route's own ceiling so the visitor gets a terminal UI state either way
// (DRO-197).
const GIVE_UP_AFTER_MS = 75_000

/**
 * Generation runs synchronously inside POST /api/envelopes/generate (same D11
 * pattern as /api/ingest), so a visitor only ever sees "generating" if they
 * load this page directly while that request is still in flight, or after a
 * crashed request left the row stuck. Either way: poll lightly and let the
 * server component re-render once the status changes, rather than wiring up
 * a realtime channel for a state that's rarely actually visible.
 */
export function GeneratingPoller({ envelopeId }: { envelopeId: string }) {
  const router = useRouter()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const startedAt = Date.now()

    const interval = setInterval(async () => {
      if (Date.now() - startedAt >= GIVE_UP_AFTER_MS) {
        clearInterval(interval)
        if (!cancelled) setTimedOut(true)
        return
      }

      const { data } = await supabase
        .from('envelopes')
        .select('status')
        .eq('id', envelopeId)
        .single()
      if (!cancelled && data && data.status !== 'generating') {
        router.refresh()
      }
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [envelopeId, router])

  if (timedOut) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border-stroke border-ink bg-card py-16 text-center shadow-ink-lg">
        <p className="text-sm font-medium text-foreground">This is taking longer than expected.</p>
        <p className="text-sm text-muted-foreground">Try making this plan again from the item selection.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border-stroke border-ink bg-card py-16 text-center shadow-ink-lg">
      <Loader2 size={20} className="animate-spin text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-foreground">Making your plan…</p>
    </div>
  )
}
