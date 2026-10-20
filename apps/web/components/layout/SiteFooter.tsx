'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

// Signed-in app-shell routes ((dashboard) and (admin) route groups) own the
// full viewport height and scroll internally (DRO-245). Rendering the
// marketing footer after them in app/layout.tsx made the document taller
// than the viewport, so the page itself could scroll and reveal the footer
// under the app shell.
const APP_SHELL_PREFIXES = ['/dashboard', '/items', '/settings', '/archive', '/trash', '/envelopes', '/admin']

function isAppShellRoute(pathname: string | null) {
  if (!pathname) return false
  return APP_SHELL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function SiteFooter() {
  const pathname = usePathname()

  if (isAppShellRoute(pathname)) {
    return null
  }

  return (
    <footer className="border-t border-border py-6 px-4">
      <div className="max-w-5xl mx-auto flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} drop-note</span>
        <Link href="/roadmap" className="hover:text-foreground transition-colors">Roadmap</Link>
        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
        <Link href="/aup" className="hover:text-foreground transition-colors">Acceptable Use</Link>
      </div>
    </footer>
  )
}
