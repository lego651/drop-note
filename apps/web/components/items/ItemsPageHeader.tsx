import Image from 'next/image'
import { Bell } from 'lucide-react'

interface ItemsPageHeaderProps {
  avatarUrl: string | null
  userInitials: string
  avatarColor: string // HSL value string from colorForTag(email), e.g. "214 89% 52%"
}

export function ItemsPageHeader({
  avatarUrl,
  userInitials,
  avatarColor,
}: ItemsPageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-background">
      <span className="text-sm font-semibold text-foreground">drop-note</span>
      <div className="flex items-center gap-3">
        {/* Bell — decorative only, no backend wired at launch */}
        <Bell
          size={18}
          className="text-muted-foreground"
          aria-label="Notifications"
        />
        {/* Avatar */}
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={userInitials}
            width={32}
            height={32}
            className="rounded-full"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
            style={{ backgroundColor: `hsl(${avatarColor})` }}
            aria-label={`User avatar: ${userInitials}`}
          >
            {userInitials}
          </div>
        )}
      </div>
    </div>
  )
}
