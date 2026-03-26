declare const __brand: unique symbol
type Brand<T, B> = T & { readonly [__brand]: B }

export type DropToken = Brand<string, 'DropToken'>

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Returns true if the string is a valid UUID v4 drop token. */
export function isValidDropToken(token: string): token is DropToken {
  return UUID_V4_RE.test(token)
}

/** Casts a validated string to DropToken, throwing if it is not a valid UUID v4. */
export function toDropToken(s: string): DropToken {
  if (!isValidDropToken(s)) throw new Error(`Invalid DropToken: ${s}`)
  return s
}

/** Generates a new UUID v4 DropToken. */
export function generateDropToken(): DropToken {
  return crypto.randomUUID() as string as DropToken
}

/** Returns true if the string looks like a valid email address. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)
}
