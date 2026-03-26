import { createClient } from '@/lib/supabase/server'
import { OnboardingPanel } from '@/components/dashboard/onboarding-panel'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { count } = await supabase.from('items').select('*', { count: 'exact', head: true })

  const hasItems = (count ?? 0) > 0

  return (
    <div className="h-full">
      {hasItems ? (
        // Item list UI — Sprint 4
        <div className="p-6">
          <p className="text-sm text-muted-foreground">Your items will appear here.</p>
        </div>
      ) : (
        <OnboardingPanel />
      )}
    </div>
  )
}
