import { supabaseAdmin } from '@/lib/supabase/admin'
import { format } from 'date-fns'
import { UserTierSelect } from './UserTierSelect'

export const metadata = { title: 'Users — Admin' }

interface UsersPageProps {
  searchParams?: Promise<{ page?: string }>
}

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  const params = (await searchParams) ?? {}
  const page = Math.max(1, parseInt(params.page ?? '1') || 1)
  const offset = (page - 1) * 50

  const { data: users, count } = await supabaseAdmin
    .from('users')
    .select('id, email, tier, is_admin, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + 49)

  const userList = users ?? []
  const totalCount = count ?? 0

  // Fetch item counts per user in parallel
  const itemCountMap = new Map<string, number>()
  await Promise.all(
    userList.map(async (u) => {
      const { count: c } = await supabaseAdmin
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', u.id)
        .is('deleted_at', null)
      itemCountMap.set(u.id, c ?? 0)
    })
  )

  const totalPages = Math.ceil(totalCount / 50)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="type-display text-[32px] sm:text-[42px]">Users</h1>
        <span className="font-mono text-[11px] text-muted-foreground">{totalCount} total</span>
      </div>

      <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Email</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Tier</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Items</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Joined</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {userList.map((u) => (
              <tr key={u.id} className="hover:bg-accent/50">
                <td className="px-4 py-2 truncate max-w-[200px]">
                  {u.email}
                  {u.is_admin && (
                    <span className="ml-1 text-xs text-muted-foreground">(admin)</span>
                  )}
                </td>
                <td className="px-4 py-2">{u.tier}</td>
                <td className="px-4 py-2 tabular-nums">{itemCountMap.get(u.id) ?? 0}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {u.created_at ? format(new Date(u.created_at), 'MMM d, yyyy') : '—'}
                </td>
                <td className="px-4 py-2">
                  <UserTierSelect userId={u.id} currentTier={u.tier ?? 'free'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <a
            href={page > 1 ? `/admin/users?page=${page - 1}` : '#'}
            className="text-sm text-muted-foreground hover:underline disabled:opacity-50"
            aria-disabled={page <= 1}
          >
            &larr; Previous
          </a>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <a
            href={page < totalPages ? `/admin/users?page=${page + 1}` : '#'}
            className="text-sm text-muted-foreground hover:underline"
            aria-disabled={page >= totalPages}
          >
            Next &rarr;
          </a>
        </div>
      )}
    </div>
  )
}
