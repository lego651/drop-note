/**
 * AI processing helpers for the synchronous ingest pipeline (D11, 2026-05-26).
 *
 * Lifted from apps/worker/src/lib/openai.ts. Uses `createAIProvider` from
 * @drop-note/shared so the provider (OpenAI / Anthropic / Gemini) is
 * controlled by the AI_PROVIDER + AI_MODEL env vars.
 *
 * Keeping this in a separate module (not inlined in route.ts) so a future
 * QStash async pivot can wrap it without rewriting the logic.
 */
import { createAIProvider, type AIProvider } from '@drop-note/shared'

let _aiProvider: AIProvider | null = null
function getAIProvider(): AIProvider {
  if (!_aiProvider) _aiProvider = createAIProvider()
  return _aiProvider
}

const MAX_INPUT_CHARS = 50_000
const IMAGE_MAX_BASE64_SIZE = 5 * 1024 * 1024

// Today's prompt asks for 3-5 tags and the model defaults to the top of that
// range (avg 4.24/item, 33/45 items hit exactly 5 on the beta test account) — that's
// the single biggest driver of tag sprawl. Capping hard at 3, enforced here
// regardless of what the model actually returns, bounds growth even if a
// provider ignores the prompt's count.
export const MAX_TAGS_PER_ITEM = 3

export interface SummarizeResult {
  summary: string
  tags: string[]
  error: string | null
  retryable: boolean
}

export async function summarizeEmailBody(
  subject: string,
  bodyText: string,
  existingTags: string[] = [],
): Promise<SummarizeResult> {
  const input = `Subject: ${subject}\n\n${bodyText}`.slice(0, MAX_INPUT_CHARS)

  try {
    const result = await getAIProvider().processText(input, existingTags)

    const tags = result.tags
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)

    const deduped = [...new Set(tags)].slice(0, MAX_TAGS_PER_ITEM)

    return { summary: result.summary ?? '', tags: deduped, error: null, retryable: false }
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { summary: '', tags: [], error: 'Invalid AI response format', retryable: false }
    }
    const isRetryable =
      err instanceof Error && (err as Error & { retryable?: boolean }).retryable === true
    return {
      summary: '',
      tags: [],
      error: err instanceof Error ? err.message : 'Unknown error',
      retryable: isRetryable,
    }
  }
}

export interface DescribeResult {
  description: string
  error: string | null
}

export async function describeImage(base64Data: string, mimeType: string): Promise<DescribeResult> {
  if (base64Data.length > IMAGE_MAX_BASE64_SIZE) {
    return { description: '', error: 'Image too large for Vision API' }
  }

  try {
    const description = await getAIProvider().describeImage(base64Data, mimeType)
    return { description, error: null }
  } catch (err) {
    return { description: '', error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
