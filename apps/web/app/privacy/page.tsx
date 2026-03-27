import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — drop-note',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm">
          Privacy policy coming soon.
        </p>
        <Link href="/" className="text-sm underline text-muted-foreground">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}
