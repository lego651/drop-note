import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@drop-note/shared'

let _client: SupabaseClient<Database> | null = null

function getClient(): SupabaseClient<Database> {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY')
    }
    _client = createClient<Database>(url, key, { auth: { persistSession: false } })
  }
  return _client
}

export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop: string | symbol) {
    const client = getClient()
    const value = (client as any)[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})
