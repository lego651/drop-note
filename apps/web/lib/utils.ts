import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the Airmail theme keys from tailwind.config.ts. Without this it reads
// `border-stroke` as a border *color* and drops it whenever `border-ink` is also present.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'border-w': [{ border: ['stroke'] }],
      'border-w-x': [{ 'border-x': ['stroke'] }],
      'border-w-y': [{ 'border-y': ['stroke'] }],
      'border-w-t': [{ 'border-t': ['stroke'] }],
      'border-w-r': [{ 'border-r': ['stroke'] }],
      'border-w-b': [{ 'border-b': ['stroke'] }],
      'border-w-l': [{ 'border-l': ['stroke'] }],
      shadow: [{ shadow: ['ink-sm', 'ink-md', 'ink-lg', 'ink-hover'] }],
      'font-family': [{ font: ['display'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
