'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
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
import { Copy, Check } from 'lucide-react'

interface SettingsClientProps {
  email: string
  tier: string
  memberSince: string
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-secondary text-secondary-foreground',
  pro: 'bg-primary text-primary-foreground',
  power: 'bg-primary text-primary-foreground',
}

export function SettingsClient({ email, tier, memberSince }: SettingsClientProps) {
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function handleCopy() {
    await navigator.clipboard.writeText('drop@dropnote.com')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleManageSubscription() {
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    if (res.ok) {
      const data = (await res.json()) as { url?: string }
      if (data.url) window.location.href = data.url
    }
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

  return (
    <div className="p-6 max-w-lg space-y-8">
      <h1 className="text-lg font-semibold">Settings</h1>

      {/* Drop Address */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Drop Address</h2>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm font-mono">
            drop@dropnote.com
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
      </section>

      <hr className="border-border" />

      {/* Account */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Account</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Member since</span>
            <span>{memberSince}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Current plan</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PLAN_COLORS[tier] ?? PLAN_COLORS.free}`}
            >
              {tier}
            </span>
          </div>
        </div>
      </section>

      <hr className="border-border" />

      {/* Subscription */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Subscription</h2>
        {tier === 'free' ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              You&apos;re on the free plan.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="/pricing">Upgrade →</a>
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={handleManageSubscription}>
            Manage Subscription
          </Button>
        )}
      </section>

      <hr className="border-border" />

      {/* Danger Zone */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-destructive">Danger Zone</h2>
        {deleteError && (
          <p className="text-xs text-destructive">{deleteError}</p>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete Account'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account, all saved items,
                files, and cancel your subscription. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete my account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  )
}
