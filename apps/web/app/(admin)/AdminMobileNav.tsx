'use client'

import Link from 'next/link'
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'
import { AdminNav } from './AdminNav'

export function AdminMobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          aria-label="Open admin menu"
          className="md:hidden -ml-1.5 inline-flex h-11 w-11 items-center justify-center text-foreground"
        >
          <Menu size={20} />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="stripe-top w-64 border-r-stroke border-ink flex flex-col p-0">
        <div className="h-14 flex items-center px-4 border-b-stroke border-ink">
          <span className="text-sm font-semibold">Admin</span>
        </div>
        <div className="flex-1 px-2 py-3">
          <AdminNav insideSheet />
        </div>
        <div className="px-3 py-3 border-t-stroke border-ink">
          <SheetClose asChild>
            <Link
              href="/items"
              className="flex min-h-11 items-center px-1 text-xs text-muted-foreground hover:underline"
            >
              &larr; Back to app
            </Link>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  )
}
