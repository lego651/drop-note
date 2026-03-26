'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { Inbox, Settings, LogOut, Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface SidebarProps {
  userEmail: string
}

export function Sidebar({ userEmail }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function handleSignOut() {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      setSignOutError('Sign out failed. Please try again.')
      return
    }
    router.refresh()
    router.push('/login')
  }

  function cycleTheme() {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <aside className="flex flex-col w-60 h-screen border-r border-border bg-background shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        <span className="text-sm font-semibold tracking-tight">drop-note</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        <Link
          href="/dashboard"
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/settings') ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'}`}
        >
          <Inbox size={16} />
          All Items
        </Link>
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${pathname === '/dashboard/settings' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'}`}
        >
          <Settings size={16} />
          Settings
        </Link>
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border space-y-1">
        <p className="px-2 text-xs text-muted-foreground truncate">{userEmail}</p>
        {signOutError && (
          <p className="px-2 text-xs text-destructive">{signOutError}</p>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={cycleTheme}
            aria-label="Toggle theme"
          >
            <ThemeIcon size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start gap-2 h-8 px-2 text-xs text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      </div>
    </aside>
  )
}
