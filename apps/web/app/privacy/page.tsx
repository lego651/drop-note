import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — drop-note',
  description: 'How drop-note collects, uses, and protects your personal data.',
}

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: March 2026</p>

      <div className="space-y-10 text-sm leading-relaxed text-foreground">

        <section>
          <h2 className="text-lg font-semibold mb-3">1. Data Controller</h2>
          <p>
            The data controller for drop-note is the operator of this service. For all data
            protection enquiries and data subject requests, contact us at{' '}
            <a href="mailto:legal@dropnote.com" className="underline text-muted-foreground">
              legal@dropnote.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">2. Personal Data We Collect</h2>
          <p className="mb-3">
            We collect and process the following categories of personal data:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>
              <span className="text-foreground font-medium">Email address</span> — used to
              identify your account and as the inbound address for drop-note&apos;s email
              ingestion service.
            </li>
            <li>
              <span className="text-foreground font-medium">Content of emails</span> — the
              body, subject, and any attachments you send to{' '}
              <span className="font-mono">drop@dropnote.com</span> are stored and processed
              to provide the service (summarisation, tagging, and display in your dashboard).
            </li>
            <li>
              <span className="text-foreground font-medium">IP address</span> — collected
              transiently for rate limiting and abuse prevention. Not stored long-term.
            </li>
            <li>
              <span className="text-foreground font-medium">Payment details</span> — billing
              information (card number, billing address) is collected and stored exclusively
              by Stripe. We do not store payment card data. See Section 7 for details.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">3. Legal Basis for Processing (GDPR Art. 6)</h2>
          <p>
            We process your personal data on the legal basis of{' '}
            <strong>contract performance (Article 6(1)(b) GDPR)</strong>. Processing your
            email address and email content is necessary to deliver the drop-note service you
            have signed up for. Without this data we cannot provide summarisation, tagging,
            or dashboard access.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">4. How We Use Your Data</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Authenticate your account via magic-link sign-in</li>
            <li>Receive and process emails you send to the ingest address</li>
            <li>Generate AI summaries and tags using OpenAI GPT-4o-mini (your content is sent to OpenAI&apos;s API and is subject to their data processing terms)</li>
            <li>Display saved items in your personal dashboard</li>
            <li>Send transactional emails (sign-in links, account notifications) via Resend</li>
            <li>Process subscription payments via Stripe</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">5. Data Retention</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>
              <span className="text-foreground font-medium">Active items</span> — retained
              for as long as your account remains active.
            </li>
            <li>
              <span className="text-foreground font-medium">Deleted items (Pro/Power tier)</span>{' '}
              — moved to trash and retained for 30 days before permanent deletion.
            </li>
            <li>
              <span className="text-foreground font-medium">Deleted items (Free tier)</span>{' '}
              — permanently deleted immediately.
            </li>
            <li>
              <span className="text-foreground font-medium">Account data</span> — deleted
              within 30 days of a verified account deletion request.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">6. Your Rights (GDPR Article 17)</h2>
          <p className="mb-3">
            You have the right to access, correct, or erase your personal data. Specifically:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>
              <span className="text-foreground font-medium">Right of erasure (right to be forgotten)</span>{' '}
              — you can delete your account and all associated data at any time via{' '}
              <strong>Settings &gt; Delete Account</strong> in the dashboard. This is
              processed immediately and your data is removed within 30 days.
            </li>
            <li>
              <span className="text-foreground font-medium">Other data subject requests</span>{' '}
              — for access requests, portability, or rectification requests, email{' '}
              <a href="mailto:legal@dropnote.com" className="underline">
                legal@dropnote.com
              </a>
              . We will respond within 30 days.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">7. Third-Party Processors</h2>
          <div className="space-y-4">
            <div>
              <p className="font-medium mb-1">Stripe (payments)</p>
              <p className="text-muted-foreground">
                Stripe processes all payment transactions and stores your payment card data.
                drop-note does not store payment card numbers or CVVs. Stripe&apos;s privacy
                policy is available at{' '}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  stripe.com/privacy
                </a>
                .
              </p>
            </div>
            <div>
              <p className="font-medium mb-1">Sentry (error monitoring)</p>
              <p className="text-muted-foreground">
                We use Sentry to capture application errors. Error reports are configured to
                exclude personally identifiable information — we do not send email addresses,
                item content, or other PII to Sentry. Only technical error context (stack
                traces, browser/OS version) is transmitted.
              </p>
            </div>
            <div>
              <p className="font-medium mb-1">OpenAI (AI processing)</p>
              <p className="text-muted-foreground">
                Email content you ingest is sent to OpenAI&apos;s API for summarisation and
                tagging. By using drop-note you acknowledge this processing. OpenAI&apos;s
                data usage policies apply; see{' '}
                <a
                  href="https://openai.com/policies/api-data-usage-policies"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  openai.com/policies/api-data-usage-policies
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">8. Cookies</h2>
          <p>
            drop-note uses essential cookies solely to maintain your authenticated session.
            We do not use tracking, advertising, or analytics cookies. You can accept
            essential cookies via the banner displayed on first visit.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">9. Contact</h2>
          <p>
            For any privacy-related questions or to exercise your data subject rights,
            contact us at{' '}
            <a href="mailto:legal@dropnote.com" className="underline text-muted-foreground">
              legal@dropnote.com
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
