import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Static marketing landing page — Server Component, no client interactivity needed.
// Shown to logged-out visitors at the root URL (/).
// Logged-in users are redirected to /items before this renders.

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Nav ── */}
      <nav className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
          <span className="text-lg font-bold tracking-tight">drop-note</span>
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

      {/* ── Hero ── */}
      <section className="mx-auto max-w-5xl px-4 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight leading-tight sm:text-5xl">
          Save anything from anywhere
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Share from any app. Email from any device. AI summarizes and tags it — everything
          lands in one searchable dashboard at{' '}
          <code className="rounded bg-muted px-2 py-0.5 text-sm font-mono text-foreground">
            drop@dropnote.me
          </code>
          .
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/login">Get started free</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a
              href="https://github.com/lego651/drop-note"
              target="_blank"
              rel="noopener noreferrer"
            >
              Self-host on GitHub
            </a>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">No credit card required · AGPL-3.0 open source</p>
      </section>

      {/* ── How it works ── */}
      <section className="bg-muted/40 border-y border-border py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-2xl font-bold tracking-tight mb-12">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold">
                1
              </div>
              <h3 className="font-semibold text-foreground mb-2">Email it</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Forward articles, paste links, send PDFs to{' '}
                <span className="font-mono text-xs text-foreground">drop@dropnote.me</span>
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold">
                2
              </div>
              <h3 className="font-semibold text-foreground mb-2">AI processes it</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GPT-4o-mini summarizes and auto-tags every item — no manual work
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold">
                3
              </div>
              <h3 className="font-semibold text-foreground mb-2">Find it later</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Search, filter, and browse your personal knowledge base
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Self-host callout ── */}
      <section className="mx-auto max-w-5xl px-4 py-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
          <span className="text-green-600 font-bold">AGPL-3.0</span>
          <span>open source</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">
          Fully open source. Self-hostable.
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
          Run your own instance with Docker. Your data, your server. No lock-in. The hosted
          version is free — self-hosting is always free, forever.
        </p>
        <Button asChild variant="outline" size="lg">
          <a
            href="https://github.com/lego651/drop-note"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </Button>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>AGPL-3.0 · Built by Jason Gao</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/aup" className="hover:text-foreground transition-colors">
              AUP
            </Link>
            <a
              href="https://github.com/lego651/drop-note"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
