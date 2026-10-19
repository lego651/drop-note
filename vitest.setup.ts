import '@testing-library/jest-dom/vitest'

// Don't persist request logs to Supabase from unit tests (see lib/observability/logger.ts).
process.env.REQUEST_LOGS_ENABLED = 'false'

// jsdom doesn't implement IntersectionObserver (used by EnvelopeEntryBanner, DRO-227).
// A no-op stub is enough — components that need real intersection behavior
// drive it directly in their tests via the callback prop instead.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin: string = ''
  readonly thresholds: ReadonlyArray<number> = []
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
// @ts-expect-error -- test-only global stub
global.IntersectionObserver = MockIntersectionObserver
