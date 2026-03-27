import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAIProvider, OpenAIProvider, AnthropicProvider, GeminiProvider } from '../ai-provider'

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

  it('throws when AI_PROVIDER=openai but OPENAI_API_KEY is not set', () => {
    process.env.AI_PROVIDER = 'openai'
    delete process.env.OPENAI_API_KEY
    expect(() => createAIProvider()).toThrow('AI_PROVIDER is "openai" but OPENAI_API_KEY is not set')
  })

  it('throws when AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set', () => {
    process.env.AI_PROVIDER = 'anthropic'
    delete process.env.ANTHROPIC_API_KEY
    expect(() => createAIProvider()).toThrow('AI_PROVIDER is "anthropic" but ANTHROPIC_API_KEY is not set')
  })

  it('throws when AI_PROVIDER=gemini but GEMINI_API_KEY is not set', () => {
    process.env.AI_PROVIDER = 'gemini'
    delete process.env.GEMINI_API_KEY
    expect(() => createAIProvider()).toThrow('AI_PROVIDER is "gemini" but GEMINI_API_KEY is not set')
  })
})

describe('OpenAIProvider.processText', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('calls OpenAI API and returns summary + tags', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ summary: 'Test summary', tags: ['tag1', 'tag2'] }) } }],
      }),
    }) as unknown as typeof fetch

    const provider = new OpenAIProvider('sk-test')
    const result = await provider.processText('Some content', [])
    expect(result).toEqual({ summary: 'Test summary', tags: ['tag1', 'tag2'] })
  })

  it('throws with rate limit hint on 429', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    }) as unknown as typeof fetch

    const provider = new OpenAIProvider('sk-test')
    await expect(provider.processText('Some content', [])).rejects.toThrow(/rate limit/)
    await expect(provider.processText('Some content', [])).rejects.toThrow(/429/)
  })

  it('throws with unauthorized hint on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    }) as unknown as typeof fetch

    const provider = new OpenAIProvider('sk-test')
    await expect(provider.processText('Some content', [])).rejects.toThrow(/unauthorized/i)
  })
})

describe('AnthropicProvider.processText', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('calls Anthropic API and returns summary + tags', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: JSON.stringify({ summary: 'Anthropic summary', tags: ['a', 'b'] }) }],
      }),
    }) as unknown as typeof fetch

    const provider = new AnthropicProvider('sk-ant-test')
    const result = await provider.processText('Some content', [])
    expect(result).toEqual({ summary: 'Anthropic summary', tags: ['a', 'b'] })
  })

  it('strips code fences before parsing JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: '```json\n{"summary":"s","tags":["t"]}\n```' }],
      }),
    }) as unknown as typeof fetch

    const provider = new AnthropicProvider('sk-ant-test')
    const result = await provider.processText('Some content', [])
    expect(result).toEqual({ summary: 's', tags: ['t'] })
  })
})

describe('GeminiProvider.processText', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('calls Gemini API and returns summary + tags', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Gemini summary', tags: ['x', 'y'] }) }] } }],
      }),
    }) as unknown as typeof fetch

    const provider = new GeminiProvider('gemini-key')
    const result = await provider.processText('Some content', [])
    expect(result).toEqual({ summary: 'Gemini summary', tags: ['x', 'y'] })
  })
})

describe('OpenAIProvider.describeImage', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('calls OpenAI API and returns image description', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'A cat' } }],
      }),
    }) as unknown as typeof fetch

    const provider = new OpenAIProvider('sk-test')
    const result = await provider.describeImage('base64data', 'image/png')
    expect(result).toBe('A cat')
  })
})
