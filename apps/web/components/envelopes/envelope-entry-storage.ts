/**
 * v1 persistence for the envelopes entry banner (DRO-227): a "Not now" click
 * snoozes the full banner to its one-line strip for 7 days, and making a
 * plan for the first time retires it to the strip permanently. Every access
 * is wrapped in try/catch — localStorage throws in Safari private mode and
 * isn't available during SSR.
 */

const NOT_NOW_UNTIL_KEY = 'dropnote.envelopeEntry.notNowUntil'
const PLAN_MADE_KEY = 'dropnote.envelopeEntry.planMade'
const SNOOZE_DAYS = 7

export function isEnvelopeEntryBannerStripped(): boolean {
  try {
    if (localStorage.getItem(PLAN_MADE_KEY) === 'true') return true
    const until = Number(localStorage.getItem(NOT_NOW_UNTIL_KEY))
    return Number.isFinite(until) && Date.now() < until
  } catch {
    return false
  }
}

export function snoozeEnvelopeEntryBanner(): void {
  try {
    const until = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000
    localStorage.setItem(NOT_NOW_UNTIL_KEY, String(until))
  } catch {
    // localStorage unavailable
  }
}

export function markEnvelopeEntryPlanMade(): void {
  try {
    localStorage.setItem(PLAN_MADE_KEY, 'true')
  } catch {
    // localStorage unavailable
  }
}
