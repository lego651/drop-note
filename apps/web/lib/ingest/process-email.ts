/**
 * Core email processing logic for the synchronous ingest pipeline (D11, 2026-05-26).
 *
 * This module contains the pure processing logic — AI summarize, tag, attachment
 * handling — extracted from the old apps/worker/src/processors/email.ts.
 *
 * It is intentionally decoupled from the HTTP layer so that a future QStash async
 * pivot wraps this function in a new route handler rather than rewrites it.
 *
 * Calling convention:
 *   - Returns normally on success (status 'done') or non-retryable failure (status 'failed').
 *   - On retryable AI error, updates the body item to 'pending' and returns status 'pending'.
 *   - Never throws — all errors are caught and surfaced via status fields.
 */
import {
  parseSendGridPayload,
  isAllowedMimeType,
  extractSingleUrl,
  extractYouTubeId,
  getYouTubeThumbnailUrl,
  fetchYouTubeTitle,
  htmlToText,
} from '@drop-note/shared'
import type { SourceType } from '@drop-note/shared'
import { fetchPageMetadata } from '@drop-note/shared/page-metadata'
import {
  setItemProcessing,
  setItemDone,
  setItemFailed,
  setItemPending,
  upsertTags,
  createAttachmentItem,
  getExistingTagNames,
  getCategoriesForUser,
  setItemCategory,
  type UserCategory,
} from './db'
import { uploadAttachment } from './storage'
import { summarizeEmailBody, describeImage } from './ai'
import { extractPdfText } from './pdf'
import { log } from '../observability/logger'

export interface ProcessEmailParams {
  userId: string
  userTier: 'free' | 'pro' | 'power'
  from: string
  subject: string
  text: string
  html: string
  attachmentInfo: string
  attachmentKeys: string[]
  attachmentData: Record<string, string>
  bodyItemId: string
}

export interface ProcessEmailResult {
  itemIds: string[]
  status: 'done' | 'failed' | 'pending'
  /** Wall-clock ms spent on AI calls only */
  aiMs: number
}

/**
 * Picks which body text to run URL/YouTube detection and summarization on.
 * When bodyText is empty, or much shorter than the HTML part (suggesting an
 * HTML-only or HTML-dominant email), renders bodyHtml to plain text instead
 * so embedded links and content aren't silently dropped.
 */
export function resolveEffectiveBodyText(bodyText: string, bodyHtml: string): string {
  if (!bodyHtml.trim()) return bodyText

  const trimmedText = bodyText.trim()
  if (!trimmedText) return htmlToText(bodyHtml)

  const renderedHtml = htmlToText(bodyHtml)
  const isHtmlDominant = trimmedText.length < renderedHtml.length * 0.1
  return isHtmlDominant ? renderedHtml : bodyText
}

export async function processEmail(params: ProcessEmailParams): Promise<ProcessEmailResult> {
  const { userId, userTier, from, subject, text, html, attachmentInfo, attachmentKeys, attachmentData, bodyItemId } = params

  await setItemProcessing(bodyItemId)

  const aiStart = Date.now()

  try {
    // Fetched once and reused for every AI call in this request so the model sees
    // the user's existing tags and reuses them instead of inventing near-duplicates.
    const existingTags = await getExistingTagNames(userId)
    // Fetched once and reused for every classification call in this request — the
    // user's current category list (defaults + custom), with "Other" always last.
    const categories = await getCategoriesForUser(userId)
    const categoryNames = categories.map((c) => c.name)

    const fields: Record<string, string> = {
      from,
      subject,
      text,
      html,
      'attachment-info': attachmentInfo,
    }
    for (const key of attachmentKeys) {
      fields[key] = attachmentData[key] ?? ''
    }

    const parsed = parseSendGridPayload(fields)

    // HTML-only or HTML-dominant emails (common for templated newsletters) can
    // leave bodyText empty or near-empty while the real content — including
    // links that only ever existed as <a href> — lives in bodyHtml. Fall back
    // to a plain-text rendering of the HTML so detection/summarization see it.
    const effectiveBodyText = resolveEffectiveBodyText(parsed.bodyText, parsed.bodyHtml ?? '')

    // Detect if body is primarily a URL
    const detectedUrl = extractSingleUrl(effectiveBodyText)
    const youtubeId = detectedUrl ? extractYouTubeId(detectedUrl) : null

    let sourceType: SourceType | null = null
    let sourceUrl: string | null = null
    let thumbnailUrl: string | null = null
    let summarizeSubject = parsed.subject
    let summarizeBody = effectiveBodyText

    if (detectedUrl && youtubeId) {
      sourceType = 'youtube'
      sourceUrl = detectedUrl
      thumbnailUrl = getYouTubeThumbnailUrl(youtubeId)
      const videoTitle = await fetchYouTubeTitle(detectedUrl)
      summarizeSubject = videoTitle ?? parsed.subject
      summarizeBody = `YouTube video: ${videoTitle ?? detectedUrl}`
      log.info('ingest.detected_youtube', { youtubeId })
    } else if (detectedUrl) {
      sourceType = 'url'
      sourceUrl = detectedUrl
      const pageMetadata = await fetchPageMetadata(detectedUrl)
      if (pageMetadata) {
        summarizeSubject = pageMetadata.title ?? parsed.subject
        summarizeBody = [pageMetadata.title, pageMetadata.description]
          .filter((part): part is string => Boolean(part))
          .join('\n\n') || summarizeBody
        thumbnailUrl = pageMetadata.imageUrl ?? null
      }
      log.info('ingest.detected_url', { host: safeHost(detectedUrl) })
    } else {
      sourceType = 'email'
    }

    // Summarize body
    const bodyResult = await summarizeEmailBody(summarizeSubject, summarizeBody, existingTags, categoryNames)
    const aiMs = Date.now() - aiStart

    if (bodyResult.error) {
      if (bodyResult.retryable) {
        // Transient AI error — item remains accessible with placeholder summary.
        // SendGrid already got 200 so it won't retry. User can re-send to reprocess.
        await setItemPending(bodyItemId, 'AI summary temporarily unavailable. Your content has been saved.')
        return { itemIds: [bodyItemId], status: 'pending', aiMs }
      } else {
        await setItemFailed(bodyItemId, bodyResult.error)
        return { itemIds: [bodyItemId], status: 'failed', aiMs }
      }
    }

    await setItemDone(bodyItemId, {
      aiSummary: bodyResult.summary,
      storagePath: null,
      filename: null,
      sourceType,
      sourceUrl,
      thumbnailUrl,
    })

    if (bodyResult.tags.length > 0) {
      await upsertTags(userId, bodyItemId, bodyResult.tags)
    }

    if (categories.length > 0) {
      await setItemCategory(bodyItemId, bodyResult.category || fallbackCategoryName(categories), categories)
    }

    // Process attachments
    const itemIds: string[] = [bodyItemId]

    for (const attachment of parsed.attachments) {
      const attachItemId = await createAttachmentItem({
        userId,
        subject: attachment.filename,
        senderEmail: from,
      })
      itemIds.push(attachItemId)

      await setItemProcessing(attachItemId)

      try {
        const uploadResult = await uploadAttachment({
          userId,
          itemId: attachItemId,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          data: attachment.data,
          tier: userTier,
        })

        let aiSummary = ''
        let aiTags: string[] = []
        // Image attachments only get a text description (no JSON/category support from
        // the vision call), so they fall back to the user's "Other" category rather than
        // going uncategorized. PDFs get a real classification via summarizeEmailBody.
        let aiCategory = fallbackCategoryName(categories)

        if (!isAllowedMimeType(attachment.mimeType)) {
          // skip unsupported mime types
        } else if (attachment.mimeType.startsWith('image/')) {
          const desc = await describeImage(attachment.data, attachment.mimeType)
          aiSummary = desc.description
        } else if (attachment.mimeType === 'application/pdf') {
          const pdfResult = await extractPdfText(attachment.data)
          if (pdfResult.text) {
            const sumResult = await summarizeEmailBody(attachment.filename, pdfResult.text, existingTags, categoryNames)
            aiSummary = sumResult.summary
            aiTags = sumResult.tags
            aiCategory = sumResult.category || aiCategory
          }
        }

        await setItemDone(attachItemId, {
          aiSummary,
          storagePath: uploadResult.storagePath,
          filename: attachment.filename,
        })

        if (aiTags.length > 0) {
          await upsertTags(userId, attachItemId, aiTags)
        }

        if (categories.length > 0) {
          await setItemCategory(attachItemId, aiCategory, categories)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        await setItemFailed(attachItemId, msg)
      }
    }

    return { itemIds, status: 'done', aiMs }
  } catch (err) {
    const aiMs = Date.now() - aiStart
    const msg = err instanceof Error ? err.message : 'Unknown error'
    log.error('ingest.process_email_failed', err)
    try {
      await setItemFailed(bodyItemId, msg)
    } catch {
      // best-effort
    }
    return { itemIds: [bodyItemId], status: 'failed', aiMs }
  }
}

// The user's "Other" category is always last in getCategoriesForUser's list — used when
// an item has no AI-determined category (e.g. image attachments, unsupported mime types).
function fallbackCategoryName(categories: UserCategory[]): string {
  return categories[categories.length - 1]?.name ?? ''
}

// Host only — full URLs can carry personal tokens in query strings.
function safeHost(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
