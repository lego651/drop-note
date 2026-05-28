import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/toaster'
import { CookieBanner } from '@/components/CookieBanner'
import Link from 'next/link'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'drop-note',
  description: 'Save anything from anywhere. AI summarizes and tags it — everything lands in one searchable dashboard.',
  metadataBase: new URL('https://dropnote.me'),
  openGraph: {
    title: 'drop-note — Save anything from anywhere',
    description: 'Share from any app. Email from any device. AI summarizes and tags it automatically.',
    url: 'https://dropnote.me',
    siteName: 'drop-note',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'drop-note' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'drop-note — Save anything from anywhere',
    description: 'Share from any app. Email from any device. AI summarizes and tags it automatically.',
    images: ['/api/og'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <footer className="border-t border-border py-6 px-4">
            <div className="max-w-5xl mx-auto flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span>© {new Date().getFullYear()} drop-note</span>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
              <Link href="/aup" className="hover:text-foreground transition-colors">Acceptable Use</Link>
            </div>
          </footer>
          <Toaster />
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  )
}
