// Correlation id helpers. Edge-safe (used by middleware): no Node-only imports.

export const CORRELATION_HEADER = 'x-correlation-id'

// Accept a caller-supplied id only if it looks like an id (prevents log injection
// and unbounded values); otherwise mint a fresh one.
const VALID_ID = /^[A-Za-z0-9._:-]{8,128}$/

export function resolveCorrelationId(incoming: string | null | undefined): string {
  if (incoming && VALID_ID.test(incoming)) return incoming
  return crypto.randomUUID()
}
