import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get profile for Stripe info
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id, tier')
    .eq('id', user.id)
    .single()

  // Cancel Stripe subscription (best-effort)
  if (profile?.stripe_customer_id && profile.tier !== 'free') {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: 'active',
        limit: 1,
      })
      if (subscriptions.data.length > 0) {
        await stripe.subscriptions.cancel(subscriptions.data[0].id)
      }
    } catch (err) {
      console.error('[account/delete] Stripe cancel failed:', err)
    }
  }

  // Delete Supabase Storage files
  const { data: itemsWithFiles } = await supabaseAdmin
    .from('items')
    .select('storage_path')
    .eq('user_id', user.id)
    .not('storage_path', 'is', null)

  if (itemsWithFiles?.length) {
    const paths = itemsWithFiles.map((i) => i.storage_path!)
    for (let i = 0; i < paths.length; i += 1000) {
      await supabaseAdmin.storage
        .from('attachments')
        .remove(paths.slice(i, i + 1000))
    }
  }

  // Delete items (cascades to item_tags via FK)
  const { error: itemsError } = await supabaseAdmin.from('items').delete().eq('user_id', user.id)
  if (itemsError) {
    console.error('[account/delete] Failed to delete items:', itemsError.message)
    return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 })
  }

  // Delete tags
  const { error: tagsError } = await supabaseAdmin.from('tags').delete().eq('user_id', user.id)
  if (tagsError) {
    console.error('[account/delete] Failed to delete tags:', tagsError.message)
    return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 })
  }

  // Delete usage_log entries
  const { error: usageError } = await supabaseAdmin.from('usage_log').delete().eq('user_id', user.id)
  if (usageError) {
    console.error('[account/delete] Failed to delete usage log:', usageError.message)
    return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 })
  }

  // Delete public.users row
  const { error: userRowError } = await supabaseAdmin.from('users').delete().eq('id', user.id)
  if (userRowError) {
    console.error('[account/delete] Failed to delete user row:', userRowError.message)
    return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 })
  }

  // Delete auth.users entry
  const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(
    user.id
  )
  if (deleteAuthError) {
    console.error('[account/delete] Auth user delete failed:', deleteAuthError)
  }

  return NextResponse.json({ ok: true })
}
