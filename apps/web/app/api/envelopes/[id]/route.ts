import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ENVELOPE_TEXT_MAX_LENGTH, parseEnvelopeBody, updateEnvelopeLeaf } from '@drop-note/shared'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// PATCH /api/envelopes/[id]
// Body: { action: 'toggle', sectionIndex: number, itemIndex: number, checked: boolean }
//     | { action: 'edit', sectionIndex: number, itemIndex: number, text: string }
//
// Sets (never flips) or edits a single checklist/list/notes leaf and persists
// it back into the envelope's `body` JSON (DRO-195). The client sends the
// target `checked` value rather than asking the server to invert the
// previous one, so retries/out-of-order delivery are idempotent instead of
// double-toggling. Writes go through the caller's own authenticated client,
// never supabaseAdmin — RLS's "envelopes: update own" policy is the real
// ownership gate; the explicit .eq('user_id', ...) below just turns another
// user's envelope into a 404 instead of a silent no-op.
async function handlePATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    let raw: { action?: unknown; sectionIndex?: unknown; itemIndex?: unknown; text?: unknown; checked?: unknown }
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { action, sectionIndex, itemIndex, text, checked } = raw
    if (action !== 'toggle' && action !== 'edit') {
      return NextResponse.json({ error: 'action must be "toggle" or "edit"' }, { status: 400 })
    }
    if (typeof sectionIndex !== 'number' || typeof itemIndex !== 'number' || sectionIndex < 0 || itemIndex < 0) {
      return NextResponse.json({ error: 'sectionIndex and itemIndex must be non-negative numbers' }, { status: 400 })
    }
    if (action === 'toggle' && typeof checked !== 'boolean') {
      return NextResponse.json({ error: 'checked must be a boolean' }, { status: 400 })
    }
    const nextChecked = typeof checked === 'boolean' ? checked : false
    const trimmedText = typeof text === 'string' ? text.trim() : ''
    if (action === 'edit' && (trimmedText.length === 0 || trimmedText.length > ENVELOPE_TEXT_MAX_LENGTH)) {
      return NextResponse.json({ error: `text must be 1-${ENVELOPE_TEXT_MAX_LENGTH} characters` }, { status: 400 })
    }

    const { data: envelope } = await supabase
      .from('envelopes')
      .select('id, status, body')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!envelope) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (envelope.status !== 'done' && envelope.status !== 'partial') {
      return NextResponse.json({ error: 'This plan cannot be edited yet' }, { status: 409 })
    }

    const parsed = parseEnvelopeBody(envelope.body)
    if (!parsed.success) {
      return NextResponse.json({ error: "This plan's content couldn't be read" }, { status: 500 })
    }

    const section = parsed.data.sections[sectionIndex]
    if (!section || section.type === 'table') {
      return NextResponse.json({ error: 'Invalid sectionIndex' }, { status: 400 })
    }
    if (action === 'toggle' && section.type !== 'checklist') {
      return NextResponse.json({ error: 'Only checklist items can be checked' }, { status: 400 })
    }

    const updatedBody = updateEnvelopeLeaf(parsed.data, sectionIndex, itemIndex, (leaf) =>
      action === 'toggle' ? { ...leaf, checked: nextChecked } : { ...leaf, text: trimmedText, edited: true },
    )
    if (!updatedBody) {
      return NextResponse.json({ error: 'Invalid itemIndex' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('envelopes')
      .update({ body: updatedBody })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) {
      log.error('envelopes.patch_failed', updateError)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    return NextResponse.json({ body: updatedBody })
  } catch (err) {
    log.error('envelopes.patch_unhandled_error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const PATCH = withRouteLogging('PATCH /api/envelopes/[id]', handlePATCH)
