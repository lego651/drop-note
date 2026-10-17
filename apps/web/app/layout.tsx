import type { Metadata } from 'next'
import { Archivo, JetBrains_Mono, Noto_Sans_SC } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/toaster'
import { CookieBanner } from '@/components/CookieBanner'
import Link from 'next/link'
import './globals.css'

// Airmail type (docs/design/AIRMAIL.md § 4). Archivo keeps its width axis for the 125% display cut.
// Noto Sans SC is the CJK fallback in every stack; it is large, so it isn't preloaded.
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })
const notoSc = Noto_Sans_SC({
  weight: ['400', '500', '700', '900'],
  preload: false,
  variable: '--font-noto-sc',
})

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${jetbrains.variable} ${notoSc.variable}`}
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <footer className="border-t border-border py-6 px-4">
            <div className="max-w-5xl mx-auto flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span>© {new Date().getFullYear()} drop-note</span>
              <Link href="/roadmap" className="hover:text-foreground transition-colors">Roadmap</Link>
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
