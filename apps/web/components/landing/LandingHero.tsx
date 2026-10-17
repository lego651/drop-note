import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CopyAddressPill } from './CopyAddressPill'
import { HeroMockup } from './HeroMockup'

export function LandingHero() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20 text-center">
      {/* Powered-by pill */}
      <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />
        Powered by GPT-4o-mini · No extensions needed
      </div>

      {/* Headline */}
      <h1 className="type-display text-[40px] sm:text-[56px] lg:text-[72px] leading-[1.05] mb-6">
        Save anything from anywhere.
      </h1>

      {/* Subheadline */}
      <p className="mx-auto max-w-xl text-lg text-muted-foreground leading-relaxed mb-10">
        Your personal content inbox. Email articles, links, videos, PDFs, and quick notes to one
        address — AI summarizes and organizes them instantly.
      </p>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
        <Button asChild size="lg">
          <Link href="/login">Get started free</Link>
        </Button>
      </div>

      {/* Copy address pill */}
      <CopyAddressPill />

      {/* Product mockup */}
      <HeroMockup />
    </section>
  )
}
