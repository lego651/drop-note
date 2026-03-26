/**
 * Returns the value of the given environment variable.
 * Throws a clear error immediately if the variable is missing or empty,
 * instead of crashing deep inside a library call with a cryptic message.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}
