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

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async processText(text: string, existingTags: string[]): Promise<{ summary: string; tags: string[] }> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a content summarizer. Given text content, return a JSON object with "summary" (2-3 sentence summary) and "tags" (array of 3-5 lowercase topic tags). Existing tags for context: ' + existingTags.join(', '),
          },
          { role: 'user', content: text.slice(0, 50000) },
        ],
        response_format: { type: 'json_object' },
      }),
    })
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
        model: 'gpt-4o-mini',
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
    })
    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    return data.choices[0]?.message?.content ?? ''
  }
}

export class AnthropicProvider implements AIProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Summarize this content and suggest tags. Existing tags for context: ${existingTags.join(', ')}.\n\nReturn JSON with "summary" (2-3 sentences) and "tags" (array of 3-5 lowercase topic tags).\n\nContent:\n${text.slice(0, 50000)}`,
          },
        ],
      }),
    })
    const data = await response.json() as { content: Array<{ text: string }> }
    const parsed = JSON.parse(data.content[0].text) as { summary: string; tags: string[] }
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
        model: 'claude-haiku-4-5-20251001',
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
    })
    const data = await response.json() as { content: Array<{ text: string }> }
    return data.content[0]?.text ?? ''
  }
}

export class GeminiProvider implements AIProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async processText(text: string, existingTags: string[]): Promise<{ summary: string; tags: string[] }> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      },
    )
    const data = await response.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> }
    const parsed = JSON.parse(data.candidates[0].content.parts[0].text) as { summary: string; tags: string[] }
    return { summary: parsed.summary ?? '', tags: parsed.tags ?? [] }
  }

  async describeImage(base64: string, mimeType: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      },
    )
    const data = await response.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> }
    return data.candidates[0]?.content?.parts[0]?.text ?? ''
  }
}

export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? 'openai'
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(process.env.OPENAI_API_KEY!)
    case 'anthropic':
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY!)
    case 'gemini':
      return new GeminiProvider(process.env.GEMINI_API_KEY!)
    default:
      throw new Error(
        `Unknown AI_PROVIDER: "${provider}". Valid values: openai, anthropic, gemini`,
      )
  }
}
