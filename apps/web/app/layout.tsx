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
  description: 'Save anything by email. AI organizes it.',
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
            </div>
          </footer>
          <Toaster />
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  )
}
