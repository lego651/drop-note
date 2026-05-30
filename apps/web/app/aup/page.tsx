import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Acceptable Use Policy — drop-note',
  description: 'Rules for acceptable use of the drop-note service.',
}

export default function AupPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-4">Acceptable Use Policy</h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: May 2026</p>

      <div className="space-y-10 text-sm leading-relaxed text-foreground">

        <section>
          <h2 className="text-lg font-semibold mb-3">1. Purpose</h2>
          <p>
            drop-note is a personal content-saving tool. This Acceptable Use Policy (AUP)
            describes what you may and may not do when using the service. It supplements the{' '}
            <Link href="/terms" className="underline">
              Terms of Service
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">2. Prohibited Uses</h2>
          <p className="mb-3">You must not use drop-note to:</p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>
              <span className="text-foreground font-medium">Send or store spam</span> — do
              not use the ingest address as a relay or forwarding point for unsolicited bulk
              email, commercial solicitations, or any form of mass messaging.
            </li>
            <li>
              <span className="text-foreground font-medium">Conduct phishing or fraud</span>{' '}
              — do not submit content intended to deceive, impersonate, or defraud any person
              or organisation.
            </li>
            <li>
              <span className="text-foreground font-medium">Store or distribute illegal content</span>{' '}
              — do not ingest content that violates applicable law, including content that
              infringes copyright, contains child sexual abuse material, incites violence, or
              facilitates illegal activity.
            </li>
            <li>
              <span className="text-foreground font-medium">Mass email scraping</span> — do
              not use automated tools, scripts, or bots to harvest, collect, or forward
              large volumes of third-party email content into drop-note for purposes other
              than your own personal use.
            </li>
            <li>
              <span className="text-foreground font-medium">Abuse the service infrastructure</span>{' '}
              — do not attempt to overload, disrupt, or circumvent any technical measures
              including rate limits, storage limits, or access controls.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">3. Consequences of Violation</h2>
          <p>
            Accounts found to be in violation of this policy will be suspended or permanently
            deleted without prior notice. We may also report illegal activity to relevant
            law enforcement authorities.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">4. Reporting Violations</h2>
          <p>
            If you believe someone is using drop-note in violation of this policy, please
            report it to{' '}
            <a href="mailto:legal@dropnote.me" className="underline text-muted-foreground">
              legal@dropnote.me
            </a>
            . Include as much detail as possible. We review all reports and will take
            appropriate action.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">5. Contact</h2>
          <p>
            Questions about this policy? Contact{' '}
            <a href="mailto:legal@dropnote.me" className="underline text-muted-foreground">
              legal@dropnote.me
            </a>
            .
          </p>
        </section>

      </div>

      <div className="mt-12 pt-8 border-t border-border">
        <Link href="/" className="text-sm text-muted-foreground underline">
          ← Back to home
        </Link>
      </div>
    </main>
  )
}
