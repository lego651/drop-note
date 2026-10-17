'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Mail,
  Bell,
  Palette,
  User,
  AlertTriangle,
  Copy,
  Check,
  LogOut,
  Trash2,
  Download,
  Sun,
  Moon,
  Monitor,
  LayoutGrid,
  List,
  ExternalLink,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

type TabId = 'drop-address' | 'notifications' | 'appearance' | 'account' | 'danger-zone'

export interface SettingsClientProps {
  email: string
  name: string
  memberSince: string
  digestEnabled: boolean
  itemsCount: number
  avatarColor: string
}

// -----------------------------------------------------------------------
// Tab definitions
// -----------------------------------------------------------------------

const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
  { id: 'drop-address', label: 'Drop Address', Icon: Mail },
  { id: 'notifications', label: 'Notifications', Icon: Bell },
  { id: 'appearance', label: 'Appearance', Icon: Palette },
  { id: 'account', label: 'Account', Icon: User },
  { id: 'danger-zone', label: 'Danger Zone', Icon: AlertTriangle },
]

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------

export function SettingsClient({
  email,
  name,
  memberSince,
  digestEnabled: initialDigestEnabled,
  itemsCount,
  avatarColor,
}: SettingsClientProps) {
  const router = useRouter()
  const { setTheme, theme: currentTheme } = useTheme()

  const [activeTab, setActiveTab] = useState<TabId>('drop-address')
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [signOutError, setSignOutError] = useState('')
  const [digestEnabled, setDigestEnabled] = useState(initialDigestEnabled)
  const [appearanceSaved, setAppearanceSaved] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState(currentTheme ?? 'light')
  const [selectedDensity, setSelectedDensity] = useState<'comfortable' | 'compact'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('drop-note:density') as 'comfortable' | 'compact') ?? 'comfortable'
    }
    return 'comfortable'
  })

  // Display name: full name or first part of email
  const displayName = name || email.split('@')[0] || 'You'
  const initials = displayName.charAt(0).toUpperCase()

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  async function handleSignOut() {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      setSignOutError('Sign out failed. Please try again.')
      return
    }
    router.refresh()
    router.push('/')
  }

  async function handleCopy() {
    await navigator.clipboard.writeText('drop@dropnote.me')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setDeleteError(data.error ?? 'Failed to delete account')
        setDeleting(false)
        return
      }
      const supabase = createClient()
      await supabase.auth.signOut()
      window.location.href = '/login?deleted=1'
    } catch {
      setDeleteError('Something went wrong')
      setDeleting(false)
    }
  }

  async function handleDigestToggle(next: boolean) {
    setDigestEnabled(next)
    const supabase = createClient()
    const { error } = await supabase
      .from('users')
      .update({ digest_enabled: next })
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    if (error) {
      setDigestEnabled(!next)
      console.error('[settings] Failed to update digest_enabled:', error.message)
    }
  }

  function handleSaveAppearance() {
    setTheme(selectedTheme)
    if (typeof window !== 'undefined') {
      localStorage.setItem('drop-note:theme', selectedTheme)
      localStorage.setItem('drop-note:density', selectedDensity)
    }
    setAppearanceSaved(true)
    setTimeout(() => setAppearanceSaved(false), 2000)
  }

  // -----------------------------------------------------------------------
  // Tab panel renderers
  // -----------------------------------------------------------------------

  function renderDropAddress() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Drop Address</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Email anything to your drop address and it will appear in your inbox within seconds.
          </p>
        </div>

        {/* Card A — Primary address */}
        <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-stroke border-dashed bg-card"
                style={{ borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' }}
              >
                <Mail size={18} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Your primary drop address</p>
                <p className="text-sm font-medium text-foreground">Active · receives all items</p>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-success"
              style={{
                backgroundColor: 'hsl(var(--color-success) / 0.08)',
                borderColor: 'hsl(var(--color-success) / 0.45)',
              }}
            >
              <CheckCircle2 size={12} />
              Active
            </span>
          </div>

          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono text-foreground">
              drop@dropnote.me
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="shrink-0 gap-1.5"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Forward emails, paste links, attach PDFs, or write quick thoughts directly to this
            address. Works from any email client on any device.
          </p>
        </div>

        {/* Card B — Address aliases */}
        <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Address aliases</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create separate addresses to auto-tag items by source.
              </p>
            </div>
            <Button variant="ghost" size="sm" disabled>
              + Add alias
            </Button>
          </div>

          <div className="space-y-2">
            {[
              { dot: 'green', addr: 'mia@drop.note', meta: 'Primary · since Jan 12, 2026' },
              { dot: 'green', addr: 'mia+research@drop.note', meta: 'Research only · since Mar 4, 2026' },
              { dot: 'gray', addr: 'mia+work@drop.note', meta: 'Work articles · since Apr 18, 2026' },
            ].map(({ dot, addr, meta }) => (
              <div key={addr} className="flex items-center gap-2 py-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      dot === 'green'
                        ? 'hsl(var(--color-status-done))'
                        : 'hsl(var(--muted-foreground) / 0.4)',
                  }}
                />
                <code className="flex-1 text-xs font-mono text-foreground">{addr}</code>
                <span className="text-xs text-muted-foreground truncate max-w-[140px]">{meta}</span>
                <div className="flex gap-1 opacity-30 cursor-not-allowed">
                  <Copy size={13} />
                  <Trash2 size={13} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card C — Quick usage guide */}
        <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Quick usage guide</h3>
          <ol className="space-y-2.5">
            {[
              'Forward any email with a link or attachment',
              'Send a link directly to your drop address as the email body',
              'Attach a PDF — the AI reads the full document',
              'Write a quick thought as the email body — saved as a note',
            ].map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="text-xs font-mono text-muted-foreground w-5 shrink-0 pt-0.5">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-sm font-medium text-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    )
  }

  function renderNotifications() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Notifications</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose when drop-note emails you. Your drop address is separate from notification emails.
          </p>
        </div>

        <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-5 space-y-5">
          {/* Group: Item Processing */}
          <div className="space-y-3">
            <p className="type-label text-muted-foreground">
              Item Processing
            </p>

            <NotificationRow
              label="Processing complete"
              description="Get an email when an item finishes processing and is ready to read. Off by default — most users check the dashboard instead."
              checked={false}
              disabled
            />

            <div className="border-t border-border" />

            <NotificationRow
              label="Failed items"
              description="Get an email when an item fails to process — usually a paywalled page or a broken link."
              checked={true}
              disabled
            />
          </div>

          <div className="border-t border-border" />

          {/* Group: Digests & Reports */}
          <div className="space-y-3">
            <p className="type-label text-muted-foreground">
              Digests &amp; Reports
            </p>

            <NotificationRow
              id="digest-toggle"
              label="Weekly digest"
              description="A summary email every Monday of what you saved last week. Includes your most-used tags and a reading list."
              checked={digestEnabled}
              onCheckedChange={handleDigestToggle}
            />

            <div className="border-t border-border" />

            <NotificationRow
              label="Monthly reading report"
              description="A monthly look at your saving habits — items saved, topics covered, reading time estimate."
              checked={false}
              disabled
            />
          </div>

          <div className="border-t border-border" />

          {/* Group: Product */}
          <div className="space-y-3">
            <p className="type-label text-muted-foreground">
              Product
            </p>

            <NotificationRow
              label="Product updates"
              description="Occasional emails about new features. Low volume — roughly once a month."
              checked={false}
              disabled
            />
          </div>
        </div>

        {/* Footer note */}
        <div className="rounded-lg bg-muted px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Notification emails are sent to{' '}
            <span className="font-medium text-foreground">{email}</span> — your Google account
            address. This is separate from your drop address.
          </p>
        </div>
      </div>
    )
  }

  function renderAppearance() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Appearance</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Customize how drop-note looks and feels.
          </p>
        </div>

        {/* Theme card */}
        <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Theme</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Choose your preferred color scheme.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { value: 'light', label: 'Light', desc: 'Clean off-white background', Icon: Sun },
              { value: 'dark', label: 'Dark', desc: 'Easy on the eyes at night', Icon: Moon },
              { value: 'system', label: 'System', desc: 'Follows your OS setting', Icon: Monitor },
            ].map(({ value, label, desc, Icon }) => {
              const isSelected = selectedTheme === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedTheme(value)}
                  className={cn(
                    'relative flex flex-col items-center gap-2 rounded-[10px] border-stroke p-3 text-center transition-colors',
                    isSelected
                      ? 'border-primary bg-accent shadow-ink-sm'
                      : 'border-ink bg-card',
                  )}
                >
                  {isSelected && (
                    <Check size={14} className="absolute right-2 top-2 text-primary" />
                  )}
                  <Icon
                    size={18}
                    className={isSelected ? 'text-accent-foreground' : 'text-muted-foreground'}
                  />
                  <span className="text-xs font-medium text-foreground">{label}</span>
                  <span className="text-[11px] text-muted-foreground leading-tight">{desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Density card */}
        <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Dashboard density</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Control how many items fit on screen at once.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { value: 'comfortable', label: 'Comfortable', desc: 'More space between items', Icon: LayoutGrid },
              { value: 'compact', label: 'Compact', desc: 'Fit more items on screen', Icon: List },
            ].map(({ value, label, desc, Icon }) => {
              const isSelected = selectedDensity === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDensity(value as 'comfortable' | 'compact')}
                  className={cn(
                    'relative flex flex-col items-center gap-2 rounded-[10px] border-stroke p-3 text-center transition-colors',
                    isSelected
                      ? 'border-primary bg-accent shadow-ink-sm'
                      : 'border-ink bg-card',
                  )}
                >
                  {isSelected && (
                    <Check size={14} className="absolute right-2 top-2 text-primary" />
                  )}
                  <Icon
                    size={18}
                    className={isSelected ? 'text-accent-foreground' : 'text-muted-foreground'}
                  />
                  <span className="text-xs font-medium text-foreground">{label}</span>
                  <span className="text-[11px] text-muted-foreground leading-tight">{desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSaveAppearance}
            disabled={appearanceSaved}
            className="gap-1.5"
          >
            {appearanceSaved ? <Check size={13} /> : null}
            {appearanceSaved ? 'Saved' : 'Save appearance'}
          </Button>
        </div>
      </div>
    )
  }

  function renderAccount() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Account</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your account is managed through Google. drop-note only stores your email address and
            preferences.
          </p>
        </div>

        {/* Card A — Profile */}
        <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold"
              style={{
                backgroundColor: `hsl(${avatarColor} / 0.12)`,
                color: `hsl(${avatarColor})`,
              }}
            >
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{email}</p>
              <p className="text-xs text-muted-foreground">Signed in with Google</p>
            </div>
          </div>

          <div className="border-t border-border" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Member since</p>
              <p className="text-sm font-medium text-foreground">{memberSince}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Items saved</p>
              <p className="text-sm font-medium text-foreground">{itemsCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Plan</p>
              <p className="text-sm font-medium text-foreground">Free</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Storage used</p>
              <p className="text-sm font-medium text-foreground">&lt; 1 MB</p>
            </div>
          </div>
        </div>

        {/* Card B — Google account */}
        <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Google G logo */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Google account</p>
                <p className="text-xs text-muted-foreground">
                  Connected as {email}. Manage your Google account to change your name or profile
                  picture.
                </p>
              </div>
            </div>
            <a
              href="https://myaccount.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
            >
              Manage
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Card C — Sign out */}
        <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Sign out</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              You will be redirected to the landing page. Your data is not affected.
            </p>
          </div>
          {signOutError && <p className="text-xs text-destructive-text">{signOutError}</p>}
          <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-1.5">
            <LogOut size={13} />
            Sign out
          </Button>
        </div>
      </div>
    )
  }

  function renderDangerZone() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-destructive-text">Danger Zone</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Irreversible actions. Read carefully before proceeding.
          </p>
        </div>

        {/* Warning banner */}
        <div
          className="flex items-start gap-3 rounded-[10px] border-stroke p-3"
          style={{
            backgroundColor: 'hsl(var(--destructive) / 0.08)',
            borderColor: 'hsl(var(--destructive) / 0.45)',
          }}
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive-text" />
          <p className="text-xs text-foreground">
            Actions on this page cannot be undone. If you want to pause your account instead, you
            can disable your drop address from the Drop Address panel.
          </p>
        </div>

        {/* Export all data */}
        <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-stroke border-dashed bg-card"
              style={{ borderColor: 'hsl(var(--ink))', color: 'hsl(var(--ink))' }}
            >
              <Download size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Export all data</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Download a complete archive of all your saved items, summaries, tags, and original
                content as a ZIP file. You will receive a download link by email.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Format: JSON + original attachments · Estimated size: &lt; 1 MB · Includes{' '}
                {itemsCount} items
              </p>
            </div>
          </div>
          <div className="border-t border-border" />
          <Button
            variant="outline"
            size="sm"
            disabled
            title="Not yet available"
            className="gap-1.5"
          >
            <Download size={13} />
            Export my data
          </Button>
        </div>

        {/* Delete account */}
        <div
          className="rounded-xl border-stroke bg-card shadow-ink-lg p-5 space-y-4"
          style={{ borderColor: 'hsl(var(--destructive))' }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: 'hsl(var(--destructive) / 0.08)' }}
            >
              <Trash2 size={16} className="text-destructive-text" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-destructive-text">Delete account</h3>
              <p className="text-xs text-muted-foreground">
                Permanently delete your drop-note account and all associated data — items,
                summaries, tags, and aliases. This action is irreversible and takes effect
                immediately.
              </p>
              <ul className="space-y-1 pt-1">
                {[
                  `All ${itemsCount} saved items will be permanently deleted`,
                  'Your drop address and all aliases will be deactivated',
                  'You will be signed out and cannot sign back in',
                  'Data cannot be recovered after deletion',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <span className="shrink-0 mt-0.5 text-destructive-text">✕</span>
                    <span className="font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {deleteError && <p className="text-xs text-destructive-text">{deleteError}</p>}

          <div className="border-t border-border" />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={deleting}
                className="gap-1.5 text-destructive-text"
              >
                <Trash2 size={13} />
                {deleting ? 'Deleting…' : 'Delete my account'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your account, all saved items, files, and cancel
                  your subscription. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  className={buttonVariants({ variant: 'destructive' })}
                >
                  Delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-6xl px-8 py-6 space-y-5">
      {/* Page header */}
      <div>
        <h1 className="type-display text-[32px] sm:text-[42px] text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your drop address, notifications, and account preferences.
        </p>
      </div>

      {/* Layout: left nav + right panel */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left tab nav */}
        <nav className="flex flex-col gap-0.5 w-full md:w-48 md:shrink-0" aria-label="Settings sections">
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id
            const isDangerZone = id === 'danger-zone'
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border-stroke border-transparent px-3 py-2 text-sm text-left w-full transition-colors',
                  isActive
                    ? 'border-ink bg-card shadow-ink-sm font-semibold'
                    : 'hover:bg-accent hover:text-accent-foreground',
                  isDangerZone && 'text-destructive-text',
                )}
              >
                <Icon size={16} />
                {label}
              </button>
            )
          })}
        </nav>

        {/* Right content panel */}
        <div className="flex-1 min-w-0">
          {activeTab === 'drop-address' && renderDropAddress()}
          {activeTab === 'notifications' && renderNotifications()}
          {activeTab === 'appearance' && renderAppearance()}
          {activeTab === 'account' && renderAccount()}
          {activeTab === 'danger-zone' && renderDangerZone()}
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// NotificationRow helper
// -----------------------------------------------------------------------

interface NotificationRowProps {
  id?: string
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onCheckedChange?: (next: boolean) => void
}

function NotificationRow({
  id,
  label,
  description,
  checked,
  disabled = false,
  onCheckedChange,
}: NotificationRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5 flex-1">
        <Label
          htmlFor={id}
          className={`text-sm font-medium leading-none ${disabled ? 'text-muted-foreground' : 'text-foreground'}`}
        >
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange ?? (() => undefined)}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  )
}
