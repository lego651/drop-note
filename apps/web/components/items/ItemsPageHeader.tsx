import { Bell } from 'lucide-react'
import { UserMenu } from '@/components/items/UserMenu'

interface ItemsPageHeaderProps {
  avatarUrl: string | null
  userInitials: string
  avatarColor: string // HSL value string from colorForTag(email), e.g. "214 89% 52%"
  userEmail?: string
  userName?: string
}

export function ItemsPageHeader({
  avatarUrl,
  userInitials,
  avatarColor,
  userEmail,
  userName,
}: ItemsPageHeaderProps) {
  return (
    // h-16 matches the sidebar's logo header height exactly so the two top bars align
    <div className="flex h-16 items-center justify-between border-b border-border bg-background px-8">
      <span className="text-sm font-semibold text-foreground">drop-note</span>
      <div className="flex items-center gap-4">
        {/* Bell — decorative, with unread indicator dot */}
        <span className="relative inline-flex" aria-label="Notifications">
          <Bell size={18} className="text-muted-foreground" />
          <span
            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive"
            aria-hidden="true"
          />
        </span>
        {/* Avatar + name — opens account menu (Settings / Sign out) */}
        <UserMenu
          avatarUrl={avatarUrl}
          userInitials={userInitials}
          avatarColor={avatarColor}
          userEmail={userEmail}
          userName={userName}
        />
      </div>
    </div>
  )
}
