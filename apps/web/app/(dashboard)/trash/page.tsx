import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { differenceInDays, format } from 'date-fns'
import { TrashActions } from './TrashActions'
import { TrashItem } from './TrashItem'

export const metadata = {
  title: 'Trash — drop-note',
}

export default async function TrashPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('tier')
    .eq('id', user.id)
    .single()

  const tier = userData?.tier ?? 'free'

  // Free user: show upgrade prompt
  if (tier === 'free') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4">Trash</h1>
        <p className="text-muted-foreground mb-4">
          Trash is available on Pro and Power plans. Free-tier deletions are permanent.
        </p>
        <Link href="/pricing" className="text-sm underline">
          Upgrade →
        </Link>
      </div>
    )
  }

  const { data: items } = await supabase
    .from('items')
    .select('id, subject, ai_summary, filename, deleted_at, type')
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  const trashItems = (items ?? []).map((item) => {
    const deletedAt = new Date(item.deleted_at!)
    const daysLeft = Math.max(0, 30 - differenceInDays(new Date(), deletedAt))
    return { ...item, deletedAt, daysLeft }
  })

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Trash</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Items are permanently deleted after 30 days.
          </p>
        </div>
        <TrashActions itemCount={trashItems.length} />
      </div>

      {trashItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">Trash is empty.</p>
      ) : (
        <ul className="space-y-2">
          {trashItems.map(({ deletedAt, daysLeft, ...item }) => (
            <li key={item.id}>
              <TrashItem
                item={item as { id: string; subject: string | null; ai_summary: string | null; filename: string | null; type: string | null }}
                deletedAt={deletedAt}
                deletedAtFormatted={format(deletedAt, 'dd MMM yyyy')}
                daysLeft={daysLeft}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
