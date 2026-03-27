import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

export interface ItemRow {
  id?: string
  user_id: string
  subject?: string | null
  sender_email?: string
  ai_summary?: string | null
  status?: string
  pinned?: boolean
  deleted_at?: string | null
  error_message?: string | null
  created_at?: string
}

export async function seedItem(userId: string, overrides: Partial<ItemRow> = {}): Promise<ItemRow> {
  const item: ItemRow = {
    user_id: userId,
    subject: 'Test subject',
    sender_email: 'sender@example.com',
    ai_summary: 'Test AI summary',
    status: 'done',
    pinned: false,
    deleted_at: null,
    ...overrides,
  }

  const { data, error } = await supabaseAdmin.from('items').insert(item).select().single()
  if (error) throw new Error(`seedItem failed: ${error.message}`)
  return data as ItemRow
}

export async function setUserTier(
  userId: string,
  tier: 'free' | 'pro' | 'power',
): Promise<void> {
  const { error } = await supabaseAdmin.from('users').update({ tier }).eq('id', userId)
  if (error) throw new Error(`setUserTier failed: ${error.message}`)
}

export async function cleanupUser(userId: string): Promise<void> {
  await supabaseAdmin.from('item_tags').delete().in(
    'item_id',
    supabaseAdmin.from('items').select('id').eq('user_id', userId),
  )
  await supabaseAdmin.from('items').delete().eq('user_id', userId)
  await supabaseAdmin.from('tags').delete().eq('user_id', userId)
}

export async function getUserId(email: string): Promise<string> {
  const { data } = await supabaseAdmin.auth.admin.listUsers()
  const user = data?.users?.find((u) => u.email === email)
  if (!user) throw new Error(`User not found: ${email}`)
  return user.id
}
