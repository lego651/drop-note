// packages/shared/src/ai-provider.ts

export interface AIProvider {
  /** Returns summary and tags from a single API call — do not split into two calls */
  processText(text: string, existingTags: string[]): Promise<{
    summary: string
    tags: string[]
  }>
  /** Returns image description. Providers that don't support vision return '' */
  describeImage(base64: string, mimeType: string): Promise<string>
}

export class OpenAIProvider implements AIProvider {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey
    this.model = model ?? 'gpt-4o-mini'
  }

  async processText(text: string, existingTags: string[]): Promise<{ summary: string; tags: string[] }> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a content summarizer. Given text content, return a JSON object with "summary" (2-3 sentence summary) and "tags" (array of 3-5 lowercase topic tags). Existing tags for context: ' + existingTags.join(', '),
          },
          { role: 'user', content: text.slice(0, 50000) },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      const body = await response.text()
      const isRetryable = [429, 500, 502, 503].includes(response.status)
      const hint = response.status === 429 ? ' (rate limit)' : response.status === 401 ? ' (unauthorized / invalid key)' : ''
      const err = new Error(`OpenAI HTTP ${response.status}${hint}: ${body.slice(0, 200)}`)
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).status = response.status
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).retryable = isRetryable
      throw err
    }
    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    const parsed = JSON.parse(data.choices[0].message.content) as { summary: string; tags: string[] }
    return { summary: parsed.summary ?? '', tags: parsed.tags ?? [] }
  }

  async describeImage(base64: string, mimeType: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe the content of this image briefly.' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      const body = await response.text()
      const isRetryable = [429, 500, 502, 503].includes(response.status)
      const hint = response.status === 429 ? ' (rate limit)' : response.status === 401 ? ' (unauthorized / invalid key)' : ''
      const err = new Error(`OpenAI HTTP ${response.status}${hint}: ${body.slice(0, 200)}`)
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).status = response.status
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).retryable = isRetryable
      throw err
    }
    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    return data.choices[0]?.message?.content ?? ''
  }
}

export class AnthropicProvider implements AIProvider {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey
    this.model = model ?? 'claude-haiku-4-5-20251001'
  }

  async processText(text: string, existingTags: string[]): Promise<{ summary: string; tags: string[] }> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Summarize this content and suggest tags. Existing tags for context: ${existingTags.join(', ')}.\n\nReturn JSON with "summary" (2-3 sentences) and "tags" (array of 3-5 lowercase topic tags).\n\nContent:\n${text.slice(0, 50000)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      const body = await response.text()
      const isRetryable = [429, 500, 502, 503].includes(response.status)
      const hint = response.status === 429 ? ' (rate limit)' : response.status === 401 ? ' (unauthorized / invalid key)' : ''
      const err = new Error(`Anthropic HTTP ${response.status}${hint}: ${body.slice(0, 200)}`)
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).status = response.status
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).retryable = isRetryable
      throw err
    }
    const data = await response.json() as { content: Array<{ text: string }> }
    const raw = data.content[0].text.replace(/^```(?:json)?\n?|\n?```$/g, '').trim()
    const parsed = JSON.parse(raw) as { summary: string; tags: string[] }
    return { summary: parsed.summary ?? '', tags: parsed.tags ?? [] }
  }

  async describeImage(base64: string, mimeType: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: base64 },
              },
              { type: 'text', text: 'Describe the content of this image briefly.' },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      const body = await response.text()
      const isRetryable = [429, 500, 502, 503].includes(response.status)
      const hint = response.status === 429 ? ' (rate limit)' : response.status === 401 ? ' (unauthorized / invalid key)' : ''
      const err = new Error(`Anthropic HTTP ${response.status}${hint}: ${body.slice(0, 200)}`)
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).status = response.status
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).retryable = isRetryable
      throw err
    }
    const data = await response.json() as { content: Array<{ text: string }> }
    return data.content[0]?.text ?? ''
  }
}

export class GeminiProvider implements AIProvider {
  private apiKey: string
  private model: string
  private visionModel: string

  constructor(apiKey: string, model?: string, visionModel?: string) {
    this.apiKey = apiKey
    this.model = model ?? 'gemini-1.5-flash'
    this.visionModel = visionModel ?? 'gemini-1.5-flash'
  }

  async processText(text: string, existingTags: string[]): Promise<{ summary: string; tags: string[] }> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Summarize this content and suggest tags. Existing tags for context: ${existingTags.join(', ')}.\n\nReturn JSON with "summary" (2-3 sentences) and "tags" (array of 3-5 lowercase topic tags).\n\nContent:\n${text.slice(0, 50000)}`,
                },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    )
    if (!response.ok) {
      const body = await response.text()
      const isRetryable = [429, 500, 502, 503].includes(response.status)
      const hint = response.status === 429 ? ' (rate limit)' : response.status === 401 ? ' (unauthorized / invalid key)' : ''
      const err = new Error(`Gemini HTTP ${response.status}${hint}: ${body.slice(0, 200)}`)
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).status = response.status
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).retryable = isRetryable
      throw err
    }
    const data = await response.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> }
    const parsed = JSON.parse(data.candidates[0].content.parts[0].text) as { summary: string; tags: string[] }
    return { summary: parsed.summary ?? '', tags: parsed.tags ?? [] }
  }

  async describeImage(base64: string, mimeType: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.visionModel}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mimeType, data: base64 } },
                { text: 'Describe the content of this image briefly.' },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      },
    )
    if (!response.ok) {
      const body = await response.text()
      const isRetryable = [429, 500, 502, 503].includes(response.status)
      const hint = response.status === 429 ? ' (rate limit)' : response.status === 401 ? ' (unauthorized / invalid key)' : ''
      const err = new Error(`Gemini HTTP ${response.status}${hint}: ${body.slice(0, 200)}`)
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).status = response.status
      ;(err as NodeJS.ErrnoException & { status: number; retryable: boolean }).retryable = isRetryable
      throw err
    }
    const data = await response.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> }
    return data.candidates[0]?.content?.parts[0]?.text ?? ''
  }
}

export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? 'openai'
  switch (provider) {
    case 'openai': {
      const key = process.env.OPENAI_API_KEY
      if (!key) throw new Error('AI_PROVIDER is "openai" but OPENAI_API_KEY is not set')
      return new OpenAIProvider(key, process.env.AI_MODEL)
    }
    case 'anthropic': {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) throw new Error('AI_PROVIDER is "anthropic" but ANTHROPIC_API_KEY is not set')
      return new AnthropicProvider(key, process.env.AI_MODEL)
    }
    case 'gemini': {
      const key = process.env.GEMINI_API_KEY
      if (!key) throw new Error('AI_PROVIDER is "gemini" but GEMINI_API_KEY is not set')
      return new GeminiProvider(key, process.env.AI_MODEL, process.env.AI_VISION_MODEL)
    }
    default:
      throw new Error(
        `Unknown AI_PROVIDER: "${provider}". Valid values: openai, anthropic, gemini`,
      )
  }
}
