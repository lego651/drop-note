import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  EnvelopeBody,
  EnvelopePatchRequestSchema,
  addEnvelopeItem,
  addEnvelopeSection,
  addEnvelopeTableRow,
  deleteEnvelopeItem,
  parseEnvelopeBody,
  renameEnvelopeSection,
  updateEnvelopeLeaf,
} from '@drop-note/shared'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// PATCH /api/envelopes/[id]
// Body: see EnvelopePatchRequestSchema (@drop-note/shared) — one of
// toggle / edit (DRO-195), or addItem / addRow / deleteItem / addSection /
// renameSection (DRO-232, "make plans extensible"). Every action is an
// explicit op addressed by section/item index, never a whole-body write —
// the server applies it to the stored body and persists the result.
//
// toggle sets (never flips) a checklist leaf's checked state — the client
// sends the target `checked` value rather than asking the server to invert
// the previous one, so retries/out-of-order delivery are idempotent instead
// of double-toggling. Writes go through the caller's own authenticated
// client, never supabaseAdmin — RLS's "envelopes: update own" policy is the
// real ownership gate; the explicit .eq('user_id', ...) below just turns
// another user's envelope into a 404 instead of a silent no-op.
async function handlePATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsedRequest = EnvelopePatchRequestSchema.safeParse(raw)
    if (!parsedRequest.success) {
      return NextResponse.json({ error: parsedRequest.error.issues[0]?.message ?? 'Invalid request body' }, { status: 400 })
    }
    const req = parsedRequest.data

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

    let updatedBody: EnvelopeBody | null

    switch (req.action) {
      case 'toggle':
      case 'edit': {
        const section = parsed.data.sections[req.sectionIndex]
        if (!section || section.type === 'table') {
          return NextResponse.json({ error: 'Invalid sectionIndex' }, { status: 400 })
        }
        if (req.action === 'toggle' && section.type !== 'checklist') {
          return NextResponse.json({ error: 'Only checklist items can be checked' }, { status: 400 })
        }
        updatedBody = updateEnvelopeLeaf(parsed.data, req.sectionIndex, req.itemIndex, (leaf) =>
          req.action === 'toggle' ? { ...leaf, checked: req.checked } : { ...leaf, text: req.text, edited: true },
        )
        break
      }
      case 'addItem': {
        updatedBody = addEnvelopeItem(parsed.data, req.sectionIndex, req.text)
        break
      }
      case 'addRow': {
        const section = parsed.data.sections[req.sectionIndex]
        if (!section || section.type !== 'table') {
          return NextResponse.json({ error: 'addRow is only valid on a table section' }, { status: 400 })
        }
        updatedBody = addEnvelopeTableRow(parsed.data, req.sectionIndex, req.cells)
        if (!updatedBody) {
          return NextResponse.json({ error: `cells must have exactly ${section.columns.length} entries` }, { status: 400 })
        }
        break
      }
      case 'deleteItem': {
        updatedBody = deleteEnvelopeItem(parsed.data, req.sectionIndex, req.itemIndex)
        break
      }
      case 'addSection': {
        updatedBody = addEnvelopeSection(parsed.data, req.blockType, req.heading, req.text)
        break
      }
      case 'renameSection': {
        const section = parsed.data.sections[req.sectionIndex]
        if (section?.type === 'notes') {
          return NextResponse.json({ error: 'A notes section has no heading to rename' }, { status: 400 })
        }
        updatedBody = renameEnvelopeSection(parsed.data, req.sectionIndex, req.heading)
        break
      }
    }

    if (!updatedBody) {
      return NextResponse.json({ error: 'Invalid sectionIndex or itemIndex' }, { status: 400 })
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
