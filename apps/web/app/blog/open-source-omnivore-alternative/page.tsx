import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'The Best Open-Source Omnivore Alternative in 2026 — drop-note',
  description:
    'Omnivore shut down. drop-note is the AGPL self-hostable replacement — email anything, AI organizes it. Free to self-host, free to use hosted.',
}

export default function BlogPostPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <div className="mb-4 text-sm text-muted-foreground">
        <Link href="/blog" className="hover:underline">
          Blog
        </Link>{' '}
        &rsaquo; Open-Source Omnivore Alternative
      </div>

      <h1 className="text-3xl font-bold mb-3 text-foreground">
        The Best Open-Source Omnivore Alternative in 2026
      </h1>
      <p className="text-sm text-muted-foreground mb-10">Published 2026-05-28</p>

      <div className="space-y-8 text-sm leading-relaxed text-foreground">

        <p>
          Omnivore got acquired by ElevenLabs in late 2024 and shut down. If you used it to save
          articles, newsletters, and research, you lost your read-later library. A lot of people
          are still looking for a replacement.
        </p>

        <p className="font-medium text-base">
          drop-note is that replacement.
        </p>

        <section>
          <h2 className="text-xl font-semibold mb-3">What happened to Omnivore</h2>
          <p className="mb-4">
            Omnivore was open-source, self-hostable, and free. It let you save anything by email
            or browser extension, read it later, and organize it with labels and highlights. It
            was genuinely good.
          </p>
          <p className="mb-4">
            Then ElevenLabs acquired it in November 2024. The hosted service shut down. The repo
            went into maintenance mode. The community scattered.
          </p>
          <p>
            The void is real. Readwise Reader is the polished commercial option at $7.99/month,
            but it is a closed SaaS. Raindrop is $3/month, focused on bookmarks not reading.
            Pocket was acquired by Mozilla and feels abandoned. None of them fill the
            &ldquo;open-source, self-hostable, email-first&rdquo; slot that Omnivore occupied.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">What drop-note is</h2>
          <p className="mb-4">
            drop-note is an email-to-dashboard content saver. You save things by emailing them.
          </p>
          <p className="mb-2 font-medium">The workflow:</p>
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground mb-4">
            <li>
              Email anything to{' '}
              <span className="font-mono text-foreground">drop@dropnote.me</span> from your
              registered address
            </li>
            <li>AI summarizes it and applies tags automatically</li>
            <li>It appears in your dashboard — searchable, filterable, organized</li>
          </ol>
          <p className="mb-4">
            That is the whole product. Email in, organized dashboard out.
          </p>
          <p className="mb-2 font-medium">What you can email:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-4">
            <li>A URL (YouTube, article, tweet thread, GitHub issue)</li>
            <li>A PDF attachment</li>
            <li>A newsletter you forwarded</li>
            <li>A note you wrote to yourself</li>
            <li>An email thread you want to archive</li>
          </ul>
          <p>
            The AI uses GPT-4o-mini to generate a one-paragraph summary and suggest tags. You
            can edit both. The dashboard gives you list view, card view, and timeline view, with
            full-text search across everything.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Why email-first</h2>
          <p className="mb-4">
            Omnivore had a browser extension and a mobile app. drop-note has neither,
            intentionally.
          </p>
          <p className="mb-4">
            Every read-later tool ends up the same: you save 400 things and read 12 of them.
            The bottleneck is not the ingestion interface, it is the triage.
          </p>
          <p className="mb-4">
            Email is already the universal inbox. You already forward things you want to
            remember. drop-note meets you there instead of asking you to install another
            extension or change your behavior.
          </p>
          <p>
            The friction of typing an email address is also useful. You only save things that
            are actually worth a second look, not everything you hover over while scrolling.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Self-hosted or hosted</h2>
          <p className="mb-4">
            drop-note is AGPL-3.0 licensed. That matters for two reasons.
          </p>
          <p className="mb-4">
            First, you can self-host the full stack on your own infrastructure with{' '}
            <span className="font-mono">docker compose up</span>. No license key, no
            phone-home telemetry, no usage caps. Your data stays where you put it.
          </p>
          <p className="mb-4">
            Second, AGPL means anyone who modifies drop-note and offers it as a service has to
            publish their source. The license protects the open-source nature of the project.
          </p>
          <p>
            The hosted version at{' '}
            <span className="font-mono">dropnote.me</span> is free. The self-hosted version is
            free. There is no paid tier right now.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">How to self-host</h2>
          <p className="mb-3 font-medium">Requirements:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-4">
            <li>Docker and Docker Compose</li>
            <li>A Supabase project (free tier works)</li>
            <li>An OpenAI API key (or configure a compatible provider)</li>
            <li>A domain with MX records pointing to SendGrid Inbound Parse</li>
          </ul>
          <pre className="bg-muted text-foreground rounded-md p-4 text-xs overflow-x-auto leading-relaxed mb-4">
            <code>{`git clone https://github.com/lego651/drop-note
cd drop-note
cp .env.example .env
# fill in your Supabase URL, anon key, service role key, OpenAI key
docker compose up`}</code>
          </pre>
          <p>Full self-hosting documentation is in the README.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-medium">Feature</th>
                  <th className="text-left py-2 pr-4 font-medium">drop-note</th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                    Omnivore (defunct)
                  </th>
                  <th className="text-left py-2 font-medium text-muted-foreground">
                    Readwise Reader
                  </th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 text-foreground">Open source</td>
                  <td className="py-2 pr-4 text-green-600 font-medium">Yes (AGPL)</td>
                  <td className="py-2 pr-4">Yes (Apache 2)</td>
                  <td className="py-2">No</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 text-foreground">Self-hostable</td>
                  <td className="py-2 pr-4 text-green-600 font-medium">Yes</td>
                  <td className="py-2 pr-4">Yes</td>
                  <td className="py-2">No</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 text-foreground">Email ingestion</td>
                  <td className="py-2 pr-4 text-green-600 font-medium">Yes</td>
                  <td className="py-2 pr-4">Yes</td>
                  <td className="py-2">No</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 text-foreground">Browser extension</td>
                  <td className="py-2 pr-4">No</td>
                  <td className="py-2 pr-4">Yes</td>
                  <td className="py-2">Yes</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 text-foreground">Mobile app</td>
                  <td className="py-2 pr-4">No</td>
                  <td className="py-2 pr-4">Yes</td>
                  <td className="py-2">Yes</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 text-foreground">AI summary</td>
                  <td className="py-2 pr-4 text-green-600 font-medium">Yes</td>
                  <td className="py-2 pr-4">No</td>
                  <td className="py-2">Yes</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-foreground">Price (hosted)</td>
                  <td className="py-2 pr-4 text-green-600 font-medium">Free</td>
                  <td className="py-2 pr-4">Was free</td>
                  <td className="py-2">$7.99/mo</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-muted-foreground">
            The gap we fill: open-source, self-hostable, email-first, AI-organized. That is a
            different product than Readwise (closed, browser-first, annotation-focused) and a
            better-maintained project than the Omnivore fork ecosystem.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Get started</h2>
          <p className="mb-6">
            The hosted version is free. No credit card, no invite code required — just sign in
            with Google.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md bg-foreground text-background px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Try drop-note free
            </Link>
            <a
              href="https://github.com/lego651/drop-note"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              Self-host it
            </a>
          </div>
        </section>

      </div>

      <div className="mt-16 pt-8 border-t border-border text-xs text-muted-foreground">
        <p>drop-note is built by Jason Gao and released under AGPL-3.0.</p>
        <Link href="/" className="underline mt-2 inline-block">
          ← Back to home
        </Link>
      </div>
    </main>
  )
}
