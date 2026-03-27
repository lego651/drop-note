import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAIProvider, OpenAIProvider, AnthropicProvider } from '../ai-provider'

describe('createAIProvider', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns OpenAIProvider when AI_PROVIDER=openai', () => {
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'sk-test'
    expect(createAIProvider()).toBeInstanceOf(OpenAIProvider)
  })

  it('returns OpenAIProvider when AI_PROVIDER is not set (default)', () => {
    delete process.env.AI_PROVIDER
    process.env.OPENAI_API_KEY = 'sk-test'
    expect(createAIProvider()).toBeInstanceOf(OpenAIProvider)
  })

  it('returns AnthropicProvider when AI_PROVIDER=anthropic', () => {
    process.env.AI_PROVIDER = 'anthropic'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    expect(createAIProvider()).toBeInstanceOf(AnthropicProvider)
  })

  it('throws for unknown AI_PROVIDER', () => {
    process.env.AI_PROVIDER = 'unknown-provider'
    expect(() => createAIProvider()).toThrow('Unknown AI_PROVIDER: "unknown-provider"')
  })
})

describe('OpenAIProvider.processText', () => {
  it('calls OpenAI API and returns summary + tags', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ summary: 'Test summary', tags: ['tag1', 'tag2'] }) } }],
      }),
    }) as unknown as typeof fetch

    const provider = new OpenAIProvider('sk-test')
    const result = await provider.processText('Some content', [])
    expect(result).toEqual({ summary: 'Test summary', tags: ['tag1', 'tag2'] })
  })
})
