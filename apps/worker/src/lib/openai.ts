import OpenAI from 'openai'
import { SUMMARIZE_EMAIL_PROMPT, IMAGE_DESCRIPTION_PROMPT } from '@drop-note/shared'

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MAX_INPUT_CHARS = 50_000
const IMAGE_MAX_BASE64_SIZE = 5 * 1024 * 1024

interface SummarizeResult {
  summary: string
  tags: string[]
  error: string | null
}

export async function summarizeEmailBody(subject: string, bodyText: string): Promise<SummarizeResult> {
  const input = `Subject: ${subject}\n\n${bodyText}`.slice(0, MAX_INPUT_CHARS)

  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SUMMARIZE_EMAIL_PROMPT },
        { role: 'user', content: input },
      ],
    })

    const raw = response.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(raw) as { summary?: string; tags?: unknown[] }

    const tags = (Array.isArray(parsed.tags) ? parsed.tags : [])
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)

    const deduped = [...new Set(tags)].slice(0, 10)

    return { summary: parsed.summary ?? '', tags: deduped, error: null }
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { summary: '', tags: [], error: 'Invalid AI response format' }
    }
    return { summary: '', tags: [], error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

interface DescribeResult {
  description: string
  error: string | null
}

export async function describeImage(base64Data: string, mimeType: string): Promise<DescribeResult> {
  if (base64Data.length > IMAGE_MAX_BASE64_SIZE) {
    return { description: '', error: 'Image too large for Vision API' }
  }

  const dataUrl = `data:${mimeType};base64,${base64Data}`

  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      temperature: 0.2,
      messages: [
        { role: 'system', content: IMAGE_DESCRIPTION_PROMPT },
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: dataUrl } }],
        },
      ],
    })

    const description = response.choices[0]?.message?.content ?? ''
    return { description, error: null }
  } catch (err) {
    return { description: '', error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
