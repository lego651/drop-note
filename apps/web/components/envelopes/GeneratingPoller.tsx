'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const POLL_INTERVAL_MS = 2000

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

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const interval = setInterval(async () => {
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

  return null
}
