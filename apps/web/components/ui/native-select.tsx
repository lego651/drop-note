import * as React from "react"

import { cn } from "@/lib/utils"

const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, ...props }, ref) => {
    return (
      <select
        className={cn(
          "h-9 rounded-[10px] border-stroke border-input bg-card px-3 text-sm shadow-ink-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
NativeSelect.displayName = "NativeSelect"

export { NativeSelect }
