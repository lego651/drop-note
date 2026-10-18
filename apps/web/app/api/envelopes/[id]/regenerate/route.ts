import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { incrementCounter } from '@/lib/counters'
import { ENVELOPE_GEN_RATE_LIMIT_PER_HOUR, fetchEnvelopeSourceItems, runEnvelopeGeneration } from '@/lib/envelopes'
import { createAIProvider, EnvelopeIntentInputSchema, parseEnvelopeBody } from '@drop-note/shared'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// Same reasoning as /api/envelopes/generate (DRO-197): regeneration runs the
// same inline AI-generation path, so it needs the same ceiling.
export const maxDuration = 60
export const runtime = 'nodejs'

// POST /api/envelopes/[id]/regenerate
//
// Regenerate-with-edits (DRO-195): re-runs generation from the envelope's
// original items + intent text. The current body's checked/edited leaves are
// fed back into the prompt as a preservation hint (buildEnvelopeRegenerationContext)
// rather than structurally merged — a regeneration can reshape sections
// entirely, so there's nothing stable to merge field-by-field onto. The fresh
// output goes through runEnvelopeGeneration's citation enforcement exactly
// like first-time generation, so a regenerated body can't smuggle in
// unverified citations either.
async function handlePOST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    // Same hourly budget as /api/envelopes/generate — a regenerate is just as
    // expensive an AI call as a first-time generate, so it draws from the
    // same `envelope_gen:{user_id}` counter rather than getting an unlimited
    // bypass (DRO-195 review, Codex finding #5).
    let overRateLimit = false
    try {
      const count = await incrementCounter(`envelope_gen:${user.id}`, 3600, {
        limit: ENVELOPE_GEN_RATE_LIMIT_PER_HOUR,
      })
      overRateLimit = count === -1
    } catch (err) {
      log.error('envelopes.regenerate_rate_limit_counter_failed', err, { action: 'allowed_through' })
    }
    if (overRateLimit) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
    }

    const { data: envelope } = await supabase
      .from('envelopes')
      .select('id, intent_input, status, body')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!envelope) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (envelope.status === 'generating') {
      return NextResponse.json({ error: 'This plan is already generating' }, { status: 409 })
    }

    const intentResult = EnvelopeIntentInputSchema.safeParse(envelope.intent_input)
    if (!intentResult.success) {
      return NextResponse.json({ error: 'This plan cannot be regenerated' }, { status: 422 })
    }
    const intentInput = intentResult.data

    const { data: linkedItems, error: linkedError } = await supabase
      .from('envelope_items')
      .select('item_id')
      .eq('envelope_id', id)

    if (linkedError || !linkedItems || linkedItems.length === 0) {
      log.error('envelopes.regenerate_no_items', linkedError ?? new Error('no linked items'))
      return NextResponse.json({ error: 'This plan has no source items' }, { status: 422 })
    }
    const itemIds = linkedItems.map((row) => row.item_id)

    const previousBodyResult = parseEnvelopeBody(envelope.body)
    const previousBody = previousBodyResult.success ? previousBodyResult.data : undefined
    // The 409 above already ruled out "generating", so this is "done" or
    // "partial" whenever `previousBody` parsed — the status to go back to if
    // the regeneration itself fails below.
    const previousStatus = envelope.status

    const { error: markGeneratingError } = await supabase
      .from('envelopes')
      .update({ status: 'generating', error_message: null })
      .eq('id', id)
      .eq('user_id', user.id)
    if (markGeneratingError) {
      log.error('envelopes.regenerate_mark_generating_failed', markGeneratingError)
      return NextResponse.json({ error: 'Failed to start regeneration' }, { status: 500 })
    }

    // On failure, a regenerate must not cost the user their last valid plan
    // (DRO-195 review, Codex finding #4): if there was one, put it back
    // instead of leaving the envelope on "failed", which hides the body and
    // the Regenerate button (see page.tsx) behind a dead end.
    const restoreOnFailure = async (errorMessage: string) => {
      const restoreUpdate = previousBody
        ? { status: previousStatus, body: envelope.body, error_message: errorMessage }
        : { status: 'failed' as const, error_message: errorMessage }
      const { error: restoreError } = await supabase.from('envelopes').update(restoreUpdate).eq('id', id)
      if (restoreError) log.error('envelopes.regenerate_restore_failed', restoreError)
    }

    try {
      const sourceItems = await fetchEnvelopeSourceItems(supabase, user.id, itemIds)
      const provider = createAIProvider()
      const result = await runEnvelopeGeneration(
        provider,
        sourceItems,
        intentInput.text,
        intentInput.purposeHint,
        Date.now,
        previousBody,
      )

      if (result.status === 'failed') {
        await restoreOnFailure(result.errorMessage)
        return NextResponse.json({ error: result.errorMessage }, { status: 502 })
      }

      const { error: updateError } = await supabase
        .from('envelopes')
        .update({ status: result.status, body: result.body })
        .eq('id', id)
      if (updateError) {
        log.error('envelopes.regenerate_update_failed', updateError)
        return NextResponse.json({ error: 'Failed to save the regenerated plan' }, { status: 500 })
      }

      return NextResponse.json({ id, status: result.status })
    } catch (err) {
      log.error('envelopes.regenerate_unhandled_error', err)
      await restoreOnFailure('Unexpected error while regenerating')
      return NextResponse.json({ error: 'Unexpected error while regenerating' }, { status: 500 })
    }
  } catch (err) {
    log.error('envelopes.regenerate_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withRouteLogging('POST /api/envelopes/[id]/regenerate', handlePOST)
