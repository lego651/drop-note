import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'
import { AdminNav } from './AdminNav'
import { AdminMobileNav } from './AdminMobileNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) notFound()

  return (
    <div className="flex h-screen bg-background">
      <aside className="stripe-top hidden w-48 shrink-0 bg-background border-r-stroke border-ink flex-col md:flex">
        <div className="h-14 flex items-center px-4 border-b-stroke border-ink">
          <span className="text-sm font-semibold">Admin</span>
        </div>
        <div className="flex-1 px-2 py-3">
          <AdminNav />
        </div>
        <div className="px-3 py-3 border-t-stroke border-ink">
          <Link href="/items" className="text-xs text-muted-foreground hover:underline">
            &larr; Back to app
          </Link>
        </div>
      </aside>
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header
          className="stripe-top md:hidden flex items-center gap-2 border-b-stroke border-ink px-3 py-2 shrink-0"
          style={{ '--stripe-h': '5px' } as React.CSSProperties}
        >
          <AdminMobileNav />
          <span className="text-sm font-semibold">Admin</span>
        </header>
        <main className="flex-1 min-w-0 overflow-y-auto bg-canvas bg-dot-grid">
          <div className="mx-auto max-w-6xl px-3 py-6 space-y-5 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
