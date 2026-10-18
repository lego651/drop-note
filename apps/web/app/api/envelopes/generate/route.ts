import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { incrementCounter } from '@/lib/counters'
import { ENVELOPE_GEN_RATE_LIMIT_PER_HOUR, fetchEnvelopeSourceItems, runEnvelopeGeneration } from '@/lib/envelopes'
import {
  createAIProvider,
  ENVELOPE_MAX_ITEMS,
  ENVELOPE_MIN_ITEMS,
  EnvelopeIntentInputSchema,
} from '@drop-note/shared'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/envelopes/generate
// Body: { itemIds: string[] (2-8, must belong to the caller), text: string (1-500 chars), purposeHint?: enum }
async function handlePOST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    let rawBody: { itemIds?: unknown; text?: unknown; purposeHint?: unknown }
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { itemIds, text, purposeHint } = rawBody

    if (!Array.isArray(itemIds) || itemIds.length < ENVELOPE_MIN_ITEMS || itemIds.length > ENVELOPE_MAX_ITEMS) {
      return NextResponse.json(
        { error: `itemIds must have between ${ENVELOPE_MIN_ITEMS} and ${ENVELOPE_MAX_ITEMS} items` },
        { status: 400 },
      )
    }
    const invalidId = itemIds.find((id) => typeof id !== 'string' || !UUID_RE.test(id))
    if (invalidId !== undefined) {
      return NextResponse.json({ error: 'All itemIds must be valid UUIDs' }, { status: 400 })
    }
    const uniqueItemIds = [...new Set(itemIds as string[])]
    if (uniqueItemIds.length !== itemIds.length) {
      return NextResponse.json({ error: 'itemIds must not contain duplicates' }, { status: 400 })
    }

    const intentResult = EnvelopeIntentInputSchema.safeParse({
      text,
      purposeHint: purposeHint ?? null,
    })
    if (!intentResult.success) {
      return NextResponse.json({ error: intentResult.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }
    const intentInput = intentResult.data

    // Separate from ingest's `ratelimit:email:{user_id}` key/budget — see lib/envelopes.ts.
    let overRateLimit = false
    try {
      const count = await incrementCounter(`envelope_gen:${user.id}`, 3600, {
        limit: ENVELOPE_GEN_RATE_LIMIT_PER_HOUR,
      })
      overRateLimit = count === -1
    } catch (err) {
      log.error('envelopes.rate_limit_counter_failed', err, { action: 'allowed_through' })
    }
    if (overRateLimit) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
    }

    // Ownership check: every itemId must belong to the caller.
    const { data: ownedItems, error: ownedError } = await supabase
      .from('items')
      .select('id')
      .in('id', uniqueItemIds)
      .eq('user_id', user.id)
      .is('deleted_at', null)

    if (ownedError) {
      log.error('envelopes.ownership_check_failed', ownedError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
    if (!ownedItems || ownedItems.length !== uniqueItemIds.length) {
      return NextResponse.json({ error: 'All itemIds must belong to you' }, { status: 403 })
    }

    const { data: envelope, error: insertError } = await supabase
      .from('envelopes')
      .insert({ user_id: user.id, intent_input: intentInput, status: 'generating' })
      .select('id')
      .single()

    if (insertError || !envelope) {
      log.error('envelopes.insert_failed', insertError)
      return NextResponse.json({ error: 'Failed to create envelope' }, { status: 500 })
    }

    const { error: itemsInsertError } = await supabase
      .from('envelope_items')
      .insert(uniqueItemIds.map((itemId) => ({ envelope_id: envelope.id, item_id: itemId })))

    if (itemsInsertError) {
      log.error('envelopes.insert_items_failed', itemsInsertError)
      await supabase
        .from('envelopes')
        .update({ status: 'failed', error_message: 'Failed to link items to envelope' })
        .eq('id', envelope.id)
      return NextResponse.json({ error: 'Failed to create envelope' }, { status: 500 })
    }

    try {
      const sourceItems = await fetchEnvelopeSourceItems(supabase, user.id, uniqueItemIds)
      const provider = createAIProvider()
      const result = await runEnvelopeGeneration(provider, sourceItems, intentInput.text, intentInput.purposeHint)

      const update = result.status === 'failed'
        ? { status: 'failed' as const, error_message: result.errorMessage }
        : { status: result.status, body: result.body }

      const { error: updateError } = await supabase.from('envelopes').update(update).eq('id', envelope.id)
      if (updateError) {
        // Don't report success — the generated body never made it to the row the
        // client is about to navigate to (it's still stuck at status "generating").
        log.error('envelopes.update_failed', updateError)
        return NextResponse.json({ error: 'Failed to save the generated plan' }, { status: 500 })
      }

      return NextResponse.json({ id: envelope.id, status: result.status })
    } catch (err) {
      log.error('envelopes.generation_unhandled_error', err)
      await supabase
        .from('envelopes')
        .update({ status: 'failed', error_message: 'Unexpected error while generating' })
        .eq('id', envelope.id)
      return NextResponse.json({ id: envelope.id, status: 'failed' })
    }
  } catch (err) {
    log.error('envelopes.generate_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withRouteLogging('POST /api/envelopes/generate', handlePOST)
