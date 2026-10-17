'use client'

import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'
import { Suspense } from 'react'
import { SidebarNav } from './sidebar'
import type { SidebarProps } from './sidebar'

export function MobileSidebar(props: SidebarProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button aria-label="Open menu" className="md:hidden p-2 text-foreground">
          <Menu size={20} />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="stripe-top w-64 border-r-stroke border-ink p-0">
        <Suspense fallback={null}>
          <SidebarNav {...props} insideSheet />
        </Suspense>
      </SheetContent>
    </Sheet>
  )
}
