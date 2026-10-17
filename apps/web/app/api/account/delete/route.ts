import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

async function handlePOST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  setLogUser(user.id)

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
      log.error('account.delete.stripe_cancel_failed', err)
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
    log.error('account.delete.items_failed', itemsError)
    return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 })
  }

  // Delete tags
  const { error: tagsError } = await supabaseAdmin.from('tags').delete().eq('user_id', user.id)
  if (tagsError) {
    log.error('account.delete.tags_failed', tagsError)
    return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 })
  }

  // Delete categories (items are already gone, so the "Other" undeletable guardrail
  // in lib/categories.ts — which this bypasses — has nothing left to protect)
  const { error: categoriesError } = await supabaseAdmin.from('categories').delete().eq('user_id', user.id)
  if (categoriesError) {
    log.error('account.delete.categories_failed', categoriesError)
    return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 })
  }

  // Delete usage_log entries
  const { error: usageError } = await supabaseAdmin.from('usage_log').delete().eq('user_id', user.id)
  if (usageError) {
    log.error('account.delete.usage_log_failed', usageError)
    return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 })
  }

  // Delete public.users row
  const { error: userRowError } = await supabaseAdmin.from('users').delete().eq('id', user.id)
  if (userRowError) {
    log.error('account.delete.user_row_failed', userRowError)
    return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 })
  }

  // Delete auth.users entry
  const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(
    user.id
  )
  if (deleteAuthError) {
    log.error('account.delete.auth_user_failed', deleteAuthError)
  }

  return NextResponse.json({ ok: true })
}

export const POST = withRouteLogging('POST /api/account/delete', handlePOST)
