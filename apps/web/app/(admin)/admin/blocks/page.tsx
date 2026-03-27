import { supabaseAdmin } from '@/lib/supabase/admin'
import { BlockListClient } from './BlockListClient'

export const metadata = { title: 'Block List — Admin' }

export default async function AdminBlocksPage() {
  const { data: blocks } = await supabaseAdmin
    .from('block_list')
    .select('id, type, value, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Block List</h1>
        <span className="text-sm text-muted-foreground">{blocks?.length ?? 0} entries</span>
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <strong>Note:</strong> Email blocks are enforced at ingest. IP blocks are stored for future enforcement (not yet enforced in v1).
      </div>

      <BlockListClient initialBlocks={blocks ?? []} />
    </div>
  )
}
