export const SUMMARIZE_EMAIL_PROMPT = `
You are a concise summarizer for a personal content-saving tool.
Given the subject and body of an email the user forwarded to themselves, produce:
1. A 2–4 sentence summary of the key information or reason the user saved this.
2. A JSON array of 3–7 lowercase tag strings (single words or short hyphenated phrases).
   Examples: "recipe", "travel", "python", "machine-learning".

Respond ONLY with a JSON object in this exact shape:
{ "summary": "...", "tags": ["...", "..."] }
Do not include any text outside the JSON object.
`

/**
 * Builds the instruction block asking the model to pick exactly one category (by meaning,
 * in any language) from the user's current category list, plus hidden search keywords.
 *
 * `categories` must be ordered with the user's "Other" / catch-all category LAST — that
 * ordering is also the fallback contract: resolveCategory() below falls back to the last
 * entry when the model's answer doesn't match any category in the list.
 */
export function buildCategoryKeywordPrompt(categories: string[], existingKeywords: string[]): string {
  const fallback = categories[categories.length - 1] ?? 'Other'
  return `Categorize this content into EXACTLY ONE of the user's categories below, choosing by meaning — the content may be in any language, classify it anyway. If nothing fits well, use "${fallback}".
Categories: ${categories.join(', ')}

Also extract 1-3 short lowercase keyword strings for search. Reuse one of the user's existing keywords whenever it fits; only invent a new keyword when none of the existing ones apply. Existing keywords: ${existingKeywords.join(', ') || '(none yet)'}

Respond with "summary" (2-3 sentence summary), "category" (one category name from the list above, exactly as written), and "tags" (array of 1-3 lowercase keyword strings — these are hidden search keywords, not shown to the user as a tag list).`
}

/**
 * Resolves the model's free-text category answer against the user's actual category
 * list, case-insensitively. Falls back to the last entry (the user's "Other" category —
 * see buildCategoryKeywordPrompt) when the model invents a name or returns nothing usable.
 */
export function resolveCategory(raw: string | null | undefined, categories: string[]): string {
  const fallback = categories[categories.length - 1] ?? 'Other'
  if (!raw) return fallback
  const trimmed = raw.trim().toLowerCase()
  const match = categories.find((c) => c.trim().toLowerCase() === trimmed)
  return match ?? fallback
}

export const IMAGE_DESCRIPTION_PROMPT = `
You are a visual content indexer for a personal content-saving tool.
Describe the image in 2–3 sentences focusing on important content, visible text,
and subject matter that would help the user find it via keyword search.
Respond with plain text only. No JSON.
`
