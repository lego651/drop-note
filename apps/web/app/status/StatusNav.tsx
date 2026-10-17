import Link from 'next/link'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/status', label: 'Health' },
  { href: '/status/usage', label: 'Usage' },
] as const

/** Tabs shared by the /status pages (both sit behind the same access code). */
export function StatusNav({ active }: { active: (typeof TABS)[number]['href'] }) {
  return (
    <nav aria-label="Status pages" className="flex gap-1 rounded-[10px] border-stroke border-ink bg-card p-1 text-sm shadow-ink-md">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? 'page' : undefined}
          className={cn(
            'flex h-8 min-w-[72px] items-center justify-center rounded-lg px-3',
            t.href === active
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
