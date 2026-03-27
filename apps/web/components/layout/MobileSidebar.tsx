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
      <SheetContent side="left" className="w-64 p-0 border-r border-border">
        <Suspense fallback={null}>
          <SidebarNav {...props} />
        </Suspense>
      </SheetContent>
    </Sheet>
  )
}
