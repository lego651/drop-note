import { describe, it, expect } from 'vitest'
import { generateDropToken, isValidDropToken, isValidEmail } from '../auth'

describe('generateDropToken', () => {
  it('returns a valid UUID v4 string', () => {
    expect(isValidDropToken(generateDropToken())).toBe(true)
  })

  it('returns a different value on each call', () => {
    expect(generateDropToken()).not.toBe(generateDropToken())
  })
})

describe('isValidDropToken', () => {
  it('returns true for a valid UUID v4', () => {
    expect(isValidDropToken('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true)
    expect(isValidDropToken('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('returns false for an empty string', () => {
    expect(isValidDropToken('')).toBe(false)
  })

  it('returns false for a UUID v3 (version digit ≠ 4)', () => {
    expect(isValidDropToken('550e8400-e29b-31d4-a716-446655440000')).toBe(false)
  })

  it('returns false for a plain string', () => {
    expect(isValidDropToken('not-a-uuid')).toBe(false)
  })
})

describe('isValidEmail', () => {
  it('returns true for a valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })

  it('returns false for a string without @', () => {
    expect(isValidEmail('not-an-email')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isValidEmail('')).toBe(false)
  })
})
