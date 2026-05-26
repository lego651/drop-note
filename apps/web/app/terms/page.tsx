import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service — drop-note',
  description: 'Terms and conditions for using the drop-note service.',
}

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: March 2026</p>

      <div className="space-y-10 text-sm leading-relaxed text-foreground">

        <section>
          <h2 className="text-lg font-semibold mb-3">1. The Service</h2>
          <p className="mb-3">
            drop-note is an email-to-dashboard content saver. By emailing any content to{' '}
            <span className="font-mono">drop@inbound.dropnote.me</span> from your registered email
            address, an AI pipeline summarises and tags each item, which you can then browse,
            search, and manage from your personal dashboard.
          </p>
          <p>
            By creating an account and using the service you agree to these Terms of Service.
            If you do not agree, do not use drop-note.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">2. Acceptable Use</h2>
          <p className="mb-3">You agree not to use drop-note to:</p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Send spam, bulk unsolicited email, or abuse the ingest address in a way that
              degrades service quality for other users</li>
            <li>Transmit content that is illegal, defamatory, obscene, or that infringes
              third-party intellectual property rights</li>
            <li>Attempt to circumvent tier limits, rate limits, or any other access controls</li>
            <li>Use automated scripts or bots to send email in excess of normal personal use</li>
            <li>Reverse engineer, decompile, or attempt to extract the source code of the
              hosted SaaS service (self-hosted users: see Section 7)</li>
          </ul>
          <p className="mt-3">
            We reserve the right to suspend or terminate accounts that violate these terms
            without prior notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">3. Accounts</h2>
          <p className="mb-3">
            You must sign in with a Google account. You are responsible for maintaining the
            security of your account. drop-note uses Google OAuth — no passwords are stored.
          </p>
          <p>
            You must be at least 16 years old to use the service (or the minimum age of
            digital consent in your jurisdiction if higher).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">4. Free Tier Limits</h2>
          <p>
            The free tier allows up to 50 saved items. If you reach the limit, new emails
            will be rejected until you delete existing items to free up space. This limit
            may be adjusted over time with reasonable notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">5. Your Content</h2>
          <p className="mb-3">
            You retain ownership of all content you send to drop-note. By using the service
            you grant drop-note a limited, non-exclusive licence to store, process, and
            display your content solely for the purpose of providing the service to you.
          </p>
          <p>
            We do not sell your content to third parties. Content is processed by OpenAI&apos;s
            API for summarisation; see our{' '}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>{' '}
            for full details of third-party processors.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">6. Limitation of Liability</h2>
          <p className="mb-3">
            The service is provided <strong>&quot;as is&quot;</strong> without warranties of any kind,
            express or implied. We make no guarantee of uptime, data durability, or
            uninterrupted access.
          </p>
          <p className="mb-3">
            To the maximum extent permitted by applicable law, drop-note shall not be liable
            for any indirect, incidental, special, consequential, or punitive damages,
            including but not limited to loss of content, loss of data, or loss of profits,
            arising from your use of or inability to use the service.
          </p>
          <p>
            You are responsible for maintaining backups of any content that is important to
            you. drop-note is not a backup solution.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">7. Self-Hosted Users — AGPL-3.0 Licence</h2>
          <p className="mb-3">
            drop-note&apos;s source code is released under the{' '}
            <strong>GNU Affero General Public License v3.0 (AGPL-3.0)</strong>. If you
            self-host drop-note, your use is governed by that licence rather than the SaaS
            payment terms in Section 4.
          </p>
          <p className="mb-3">
            Key AGPL-3.0 obligations for self-hosters:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>You must make the complete corresponding source code available to users of
              your hosted instance, including any modifications you have made.</li>
            <li>You must preserve all copyright and licence notices.</li>
            <li>Any derivative work you distribute or offer as a network service must also
              be released under AGPL-3.0.</li>
          </ul>
          <p className="mt-3">
            The full licence text is available in the repository at{' '}
            <a
              href="https://github.com/lego651/drop-note/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-muted-foreground"
            >
              github.com/lego651/drop-note
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">8. Termination</h2>
          <p>
            Either party may terminate the agreement at any time. You may close your account
            via <strong>Settings &gt; Delete Account</strong>. We may suspend or terminate
            accounts for violations of these terms, non-payment, or legal requirements.
            On termination, your data will be deleted in accordance with our{' '}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">9. Changes to These Terms</h2>
          <p>
            We may update these terms from time to time. We will notify you by email at
            least 14 days before material changes take effect. Continued use of the service
            after the effective date constitutes acceptance of the revised terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">10. Contact</h2>
          <p className="mb-3">
            drop-note is operated by <strong>Jason Gao</strong> (individual). Questions about
            these terms or DMCA notices? Contact{' '}
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
