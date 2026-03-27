import { createAIProvider, type AIProvider } from '@drop-note/shared'

let _aiProvider: AIProvider | null = null
function getAIProvider(): AIProvider {
  if (!_aiProvider) _aiProvider = createAIProvider()
  return _aiProvider
}

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
    const result = await getAIProvider().processText(input, [])

    const tags = result.tags
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)

    const deduped = [...new Set(tags)].slice(0, 10)

    return { summary: result.summary ?? '', tags: deduped, error: null }
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

  try {
    const description = await getAIProvider().describeImage(base64Data, mimeType)
    return { description, error: null }
  } catch (err) {
    return { description: '', error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
