import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '@drop-note/shared'
import type { Database } from '@drop-note/shared'

export const supabaseAdmin = createClient<Database>(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } }
)
