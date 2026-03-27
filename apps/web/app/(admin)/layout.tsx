import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'
import { AdminNav } from './AdminNav'

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
      <aside className="w-48 shrink-0 border-r border-border bg-background flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <span className="text-sm font-semibold">Admin</span>
        </div>
        <div className="flex-1 px-2 py-3">
          <AdminNav />
        </div>
        <div className="px-3 py-3 border-t border-border">
          <Link href="/items" className="text-xs text-muted-foreground hover:underline">
            &larr; Back to app
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
