/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openExternalUrl } from '../open-external'

describe('openExternalUrl', () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a temporary anchor with noopener and invokes click', () => {
    const create = vi.spyOn(document, 'createElement')
    openExternalUrl('https://example.com/path')

    expect(create).toHaveBeenCalledWith('a')
    const a = create.mock.results[0]?.value as HTMLAnchorElement
    expect(a.href).toBe('https://example.com/path')
    expect(a.target).toBe('_blank')
    expect(a.rel).toBe('noopener noreferrer')
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
  })
})
