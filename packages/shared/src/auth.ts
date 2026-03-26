/** Generates a UUID v4 string for use as a drop_token. */
export function generateDropToken(): string {
  return crypto.randomUUID()
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Returns true if the string is a valid UUID v4. */
export function isValidDropToken(token: string): boolean {
  return UUID_V4_RE.test(token)
}

/** Returns true if the string looks like a valid email address. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export type DropToken = string
