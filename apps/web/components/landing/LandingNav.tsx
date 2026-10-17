import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function LandingNav() {
  return (
    <nav
      className="stripe-top border-b-stroke border-ink bg-background sticky top-0 z-10"
      style={{ '--stripe-h': '5px' } as React.CSSProperties}
    >
      <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
        {/* Left: logo */}
        <Link href="/" className="flex items-center gap-2 type-display text-lg text-foreground hover:opacity-80 transition-opacity">
          <Mail className="h-5 w-5" />
          <span>drop-note</span>
        </Link>

        {/* Right: nav links */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link
            href="/roadmap"
            className="hover:text-foreground transition-colors"
          >
            Roadmap
          </Link>
          <Button asChild size="sm">
            <Link href="/login">Get started free</Link>
          </Button>
        </div>
      </div>
    </nav>
  )
}
