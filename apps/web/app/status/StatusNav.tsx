import Link from 'next/link'

const TABS = [
  { href: '/status', label: 'Health' },
  { href: '/status/usage', label: 'Usage' },
] as const

/** Tabs shared by the /status pages (both sit behind the same access code). */
export function StatusNav({ active }: { active: (typeof TABS)[number]['href'] }) {
  return (
    <nav aria-label="Status pages" className="flex gap-1 rounded-lg border border-border bg-card p-1 text-sm">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? 'page' : undefined}
          className={
            t.href === active
              ? 'rounded-md bg-primary px-3 py-1 text-primary-foreground'
              : 'rounded-md px-3 py-1 text-muted-foreground hover:text-foreground'
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
