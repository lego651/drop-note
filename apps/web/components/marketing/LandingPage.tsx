import { LandingNav } from '@/components/landing/LandingNav'
import { LandingHero } from '@/components/landing/LandingHero'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { Features } from '@/components/landing/Features'
import { Testimonials } from '@/components/landing/Testimonials'
import { LandingCTA } from '@/components/landing/LandingCTA'
import { LandingFooter } from '@/components/landing/LandingFooter'

// Static marketing landing page — Server Component, no client interactivity at this level.
// Shown to logged-out visitors at the root URL (/).
// Logged-in users are redirected to /items before this renders (see app/page.tsx).
// CopyAddressPill inside LandingHero uses 'use client' for clipboard API.

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />
      <LandingHero />
      <HowItWorks />
      <Features />
      <Testimonials />
      <LandingCTA />
      <LandingFooter />
    </div>
  )
}
