import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Save Anything From Anywhere — drop-note',
  description:
    'Email it, forward it, share it. drop-note is your universal inbox: AI summarizes and tags everything, free, open-source (AGPL), self-hostable.',
}

export default function BlogPostPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <div className="mb-4 text-sm text-muted-foreground">
        <Link href="/blog" className="hover:underline">
          Blog
        </Link>{' '}
        &rsaquo; Save Anything From Anywhere
      </div>

      <h1 className="text-3xl font-bold mb-3 text-foreground">
        Save Anything From Anywhere
      </h1>
      <p className="text-sm text-muted-foreground mb-10">Published 2026-05-28</p>

      <div className="space-y-8 text-sm leading-relaxed text-foreground">

        <p>
          You save things in a dozen different ways. You email yourself links. You
          forward newsletters you mean to read. You screenshot articles. You copy-paste
          URLs into notes apps that you never open again.
        </p>

        <p className="font-medium text-base">
          drop-note is a single place to send all of it.
        </p>

        <section>
          <h2 className="text-xl font-semibold mb-3">One address. Every source.</h2>
          <p className="mb-4">
            Your drop address is{' '}
            <span className="font-mono">drop@dropnote.me</span>.
            Anything you email there — from any app, any device, any platform — lands
            in your dashboard, summarized and tagged by AI.
          </p>
          <p className="mb-2 font-medium">What you can send:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-4">
            <li>A URL (YouTube, article, tweet thread, GitHub issue)</li>
            <li>A PDF attachment</li>
            <li>A newsletter you forwarded from your inbox</li>
            <li>A note you wrote to yourself</li>
            <li>An email thread you want to archive</li>
          </ul>
          <p>
            The workflow: email it in, AI processes it within seconds, it appears in your
            dashboard — searchable, filterable, organized. That is the whole product.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Why email as the interface</h2>
          <p className="mb-4">
            Email is already universal. Every app, every platform, every device can send
            email. You do not need to install an extension. You do not need a mobile app.
            You do not need to change the way you work.
          </p>
          <p className="mb-4">
            Every read-later tool ends up the same way: you save 400 things and read 12
            of them. The bottleneck is not the saving interface. It is the triage after.
            drop-note solves that by making the AI do the organizing work — you just save,
            it tags and summarizes.
          </p>
          <p>
            The friction of typing an email address is also useful. You only send things
            that are actually worth a second look, not everything you hover over while
            scrolling.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Open source. Self-hostable.</h2>
          <p className="mb-4">
            drop-note is AGPL-3.0 licensed. That matters for two reasons.
          </p>
          <p className="mb-4">
            First, you can self-host the full stack on your own infrastructure with{' '}
            <span className="font-mono">docker compose up</span>. No license key, no
            phone-home telemetry, no usage caps. Your data stays where you put it.
          </p>
          <p className="mb-4">
            Second, AGPL means anyone who modifies drop-note and offers it as a service
            has to publish their source. The license protects the open-source nature.
          </p>
          <p>
            The hosted version at{' '}
            <span className="font-mono">dropnote.me</span> is free. The self-hosted
            version is free. There is no paid tier right now.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">If you used Omnivore</h2>
          <p className="mb-4">
            Omnivore was acquired by ElevenLabs in late 2024 and shut down. If you were
            a user, drop-note covers the email-ingestion and self-hostable parts of what
            Omnivore offered, with AI summarization added.
          </p>
          <p>
            It is not a one-to-one replacement — there is no browser extension or mobile
            app right now — but it fills the open-source, email-first, self-hostable
            slot that Omnivore left.
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
          <h2 className="text-xl font-semibold mb-3">Get started</h2>
          <p className="mb-6">
            The hosted version is free. No credit card, no invite code required — just
            sign in with Google.
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
