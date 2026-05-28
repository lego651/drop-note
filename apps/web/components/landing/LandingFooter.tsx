import Link from 'next/link'
import { Mail } from 'lucide-react'

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        {/* Left: brand + nav */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/"
            className="flex items-center gap-1.5 font-semibold text-foreground hover:opacity-80 transition-opacity"
          >
            <Mail className="h-4 w-4" />
            <span>drop-note</span>
          </Link>
          <Link href="/blog/open-source-omnivore-alternative" className="hover:text-foreground transition-colors">
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
          <Link href="/login" className="hover:text-foreground transition-colors">
            Get started
          </Link>
          <Link href="/roadmap" className="hover:text-foreground transition-colors">
            Roadmap
          </Link>
        </div>

        {/* Right: legal */}
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
          <span>© 2026 drop-note</span>
        </div>
      </div>
    </footer>
  )
}
