import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'

const serifItalic: React.CSSProperties = {
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
  fontStyle: 'italic',
}

export function LandingCTA() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20">
      <div className="rounded-2xl bg-muted/50 border border-border p-12 text-center">
        {/* Headline */}
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
          Start saving in <span style={serifItalic}>30 seconds.</span>
        </h2>

        {/* Subhead */}
        <p className="text-muted-foreground max-w-md mx-auto mb-10 leading-relaxed">
          Sign in with Google, get your drop address, and send your first item. No credit card, no
          setup wizard.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <Button asChild size="lg">
            <Link href="/login">Get started free</Link>
          </Button>
        </div>

        {/* Address pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-1.5 text-sm text-muted-foreground">
          <Mail className="h-3.5 w-3.5" />
          <span className="font-mono text-foreground">drop@dropnote.me</span>
        </div>
      </div>
    </section>
  )
}
