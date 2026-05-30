'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface UserMenuProps {
  avatarUrl: string | null
  userInitials: string
  avatarColor: string // HSL value string, e.g. "214 89% 52%"
  userEmail?: string
  userName?: string
}

export function UserMenu({ avatarUrl, userInitials, avatarColor, userEmail, userName }: UserMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    const supabase = createClient()
    const { error: signOutErr } = await supabase.auth.signOut()
    if (signOutErr) {
      setError('Sign out failed. Please try again.')
      return
    }
    setOpen(false)
    router.refresh()
    router.push('/')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex items-center gap-2 rounded-full pr-1 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
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
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: `hsl(${avatarColor})` }}
            >
              {userInitials}
            </div>
          )}
          {userName && (
            <span className="max-w-[120px] truncate text-sm font-medium text-foreground">
              {userName}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="end">
        {userEmail && (
          <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{userEmail}</p>
        )}
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Settings size={14} />
          Settings
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut size={14} />
          Sign out
        </button>
        {error && <p className="px-2 py-1 text-xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  )
}
