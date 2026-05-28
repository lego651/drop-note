import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function LandingNav() {
  return (
    <nav className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
        {/* Left: logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-foreground hover:opacity-80 transition-opacity">
          <Mail className="h-5 w-5" />
          <span>drop-note</span>
        </Link>

        {/* Right: nav links */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link
            href="/blog/open-source-omnivore-alternative"
            className="hover:text-foreground transition-colors"
          >
            Blog
          </Link>
          <a
            href="https://github.com/lego651/drop-note"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <Button asChild size="sm">
            <Link href="/login">Get started free</Link>
          </Button>
        </div>
      </div>
    </nav>
  )
}
