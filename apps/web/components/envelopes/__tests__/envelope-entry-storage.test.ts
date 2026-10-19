/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isEnvelopeEntryBannerStripped,
  snoozeEnvelopeEntryBanner,
  markEnvelopeEntryPlanMade,
} from '../envelope-entry-storage'

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('envelope-entry-storage (DRO-227)', () => {
  it('is not stripped by default', () => {
    expect(isEnvelopeEntryBannerStripped()).toBe(false)
  })

  it('snoozes the banner for 7 days after "Not now"', () => {
    snoozeEnvelopeEntryBanner()
    expect(isEnvelopeEntryBannerStripped()).toBe(true)
  })

  it('un-strips once the 7-day snooze has elapsed', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    snoozeEnvelopeEntryBanner()
    expect(isEnvelopeEntryBannerStripped()).toBe(true)

    vi.spyOn(Date, 'now').mockReturnValue(now + 8 * 24 * 60 * 60 * 1000)
    expect(isEnvelopeEntryBannerStripped()).toBe(false)
  })

  it('stays stripped permanently once a plan has been made, even past the snooze window', () => {
    markEnvelopeEntryPlanMade()
    expect(isEnvelopeEntryBannerStripped()).toBe(true)
  })

  it('never throws when localStorage is unavailable (e.g. Safari private mode)', () => {
    const original = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: access denied')
      },
    })

    expect(() => snoozeEnvelopeEntryBanner()).not.toThrow()
    expect(() => markEnvelopeEntryPlanMade()).not.toThrow()
    expect(isEnvelopeEntryBannerStripped()).toBe(false)

    Object.defineProperty(window, 'localStorage', { configurable: true, value: original })
  })
})
