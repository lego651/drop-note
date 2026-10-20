import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// DRO-245 — Tailwind emits `.h-dvh` before `.h-screen` in the generated CSS,
// so at equal specificity `h-screen` always wins regardless of class order
// in the JSX (e.g. "h-screen h-dvh" never actually applies dvh). The shell
// must gate the dvh value behind a `supports-[height:100dvh]:` variant
// instead, so iOS Safari's dynamic viewport height is actually used.
describe('dashboard app shell height classes', () => {
  const source = readFileSync(join(__dirname, '..', 'layout.tsx'), 'utf-8')
  const classNameAttrs = [...source.matchAll(/className="([^"]*)"/g)].map((match) => match[1])
  const shellClassName = classNameAttrs.find((value) => value.includes('overflow-hidden'))

  it('finds the shell className', () => {
    expect(shellClassName).toBeDefined()
  })

  it('does not apply a bare h-screen alongside h-dvh', () => {
    expect(shellClassName).not.toMatch(/h-screen\s+h-dvh/)
  })

  it('gates h-dvh behind a supports(height:100dvh) check', () => {
    expect(shellClassName).toMatch(/supports-\[height:100dvh\]:h-dvh/)
  })
})
