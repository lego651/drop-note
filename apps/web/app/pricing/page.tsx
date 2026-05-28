import Link from 'next/link'

// D1 (2026-04-02): Killed $9.99/mo Pro and $49.99/mo Power tiers.
// drop-note launches 100% free. $4.99/mo hosted tier only if 100+ active users.
// Stripe code stays in the repo (null-checked, ready for 1-PR reactivation) — just not shown here.
// See docs/next-plan.md § 3 for the decision record.

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Simple, free pricing</h1>
        <p className="mt-3 text-muted-foreground">
          drop-note is free to use. No credit card required.
        </p>
      </div>

      {/* Free tier card */}
      <div className="rounded-xl border border-primary bg-primary/5 p-8 max-w-sm mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Free</h2>
            <span className="rounded-full border border-primary px-2 py-0.5 text-xs text-primary">
              Current plan
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">$0</p>
          <p className="text-sm text-muted-foreground">forever</p>
        </div>

        <ul className="mb-8 space-y-3 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className="text-green-600 font-bold">✓</span>
            50 items stored
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600 font-bold">✓</span>
            Unlimited saves per month
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600 font-bold">✓</span>
            AI summaries and auto-tagging
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600 font-bold">✓</span>
            Full text search
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600 font-bold">✓</span>
            Weekly digest email
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600 font-bold">✓</span>
            Email ingest via drop@dropnote.me
          </li>
        </ul>

        <Link
          href="/login"
          className="block rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Get started free
        </Link>
      </div>

      {/* Self-host note */}
      <div className="mt-12 rounded-lg border border-border bg-muted/40 p-6 text-center">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Want more? Self-host drop-note for free with Docker.{' '}
          <span className="text-foreground font-medium">AGPL-3.0 open source</span> — no limits
          on your own instance.
        </p>
        <a
          href="https://github.com/lego651/drop-note"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          View on GitHub →
        </a>
      </div>
    </div>
  )
}
