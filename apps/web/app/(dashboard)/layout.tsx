import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileSidebar } from '@/components/layout/MobileSidebar'
import { DashboardMain } from '@/components/layout/DashboardMain'
import { BulkSelectProvider } from '@/components/items/BulkSelectProvider'
import { getCategoriesWithCounts } from '@/lib/categories'
import { TIER_ITEM_LIMITS } from '@drop-note/shared'
import type { Tier } from '@drop-note/shared'
import type { CategoryWithCount } from '@/components/layout/CategoryNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  let categories: CategoryWithCount[] = []
  let categoriesError = false
  try {
    categories = await getCategoriesWithCounts(user.id)
  } catch {
    categoriesError = true
  }

  const [
    { data: userData },
    { count: itemCount },
    { data: monthData },
    { count: trashCount },
    { count: archiveCount },
    { count: allItemsCount },
    { count: pinnedCount },
    { count: envelopeCount },
  ] = await Promise.all([
    supabase.from('users').select('tier').eq('id', user.id).single(),
    supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),
    // RLS: items policy enforces user_id = auth.uid(), no need for .eq()
    supabase.rpc('get_month_counts'),
    supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('deleted_at', 'is', null),
    supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .not('archived_at', 'is', null),
    // "All Items" count — active, non-archived, email-body items (matches /items view)
    supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .is('archived_at', null)
      .eq('type', 'email_body'),
    // "Pinned" count — same scope, pinned only
    supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .is('archived_at', null)
      .eq('type', 'email_body')
      .eq('pinned', true),
    // "Envelopes" nav count — every plan the user has made, regardless of status
    supabase
      .from('envelopes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  const tier = (userData?.tier ?? 'free') as Tier
  const isOverCap = (itemCount ?? 0) > TIER_ITEM_LIMITS[tier]

  return (
    <BulkSelectProvider>
      {/* h-dvh (after h-screen) tracks the visible area when iOS Safari's chrome
          shows/hides, so the FAB and last list item aren't hidden behind the
          toolbar; h-screen stays as the fallback for browsers without dvh support. */}
      <div className="flex h-screen h-dvh overflow-hidden bg-background">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-md focus:px-3 focus:py-2 focus:bg-background focus:text-foreground focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <Sidebar
          userEmail={user.email ?? ''}
          categories={categories}
          categoriesError={categoriesError}
          monthCounts={monthData ?? []}
          trashCount={trashCount ?? 0}
          archiveCount={archiveCount ?? 0}
          totalCount={allItemsCount ?? 0}
          pinnedCount={pinnedCount ?? 0}
          envelopeCount={envelopeCount ?? 0}
        />
        <div className="flex flex-col flex-1 min-w-0">
          {/* Mobile top bar */}
          <header
            className="stripe-top md:hidden flex items-center gap-2 border-b-stroke border-ink px-3 py-2 shrink-0"
            style={{ '--stripe-h': '5px' } as React.CSSProperties}
          >
            <MobileSidebar
              userEmail={user.email ?? ''}
              categories={categories}
              categoriesError={categoriesError}
              monthCounts={monthData ?? []}
              trashCount={trashCount ?? 0}
              archiveCount={archiveCount ?? 0}
              totalCount={allItemsCount ?? 0}
              pinnedCount={pinnedCount ?? 0}
              envelopeCount={envelopeCount ?? 0}
            />
            <span className="font-display text-base font-extrabold [font-stretch:125%]">drop-note</span>
          </header>
          <DashboardMain isOverCap={isOverCap} itemCount={itemCount ?? 0} tier={tier}>
            {children}
          </DashboardMain>
        </div>
      </div>
    </BulkSelectProvider>
  )
}
