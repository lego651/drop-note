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
} from '@drop-note/shared'
import type { SourceType } from '@drop-note/shared'
import { setItemProcessing, setItemDone, setItemFailed, setItemPending, upsertTags, createAttachmentItem } from './db'
import { uploadAttachment } from './storage'
import { summarizeEmailBody, describeImage } from './ai'
import { extractPdfText } from './pdf'

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

export async function processEmail(params: ProcessEmailParams): Promise<ProcessEmailResult> {
  const { userId, userTier, from, subject, text, html, attachmentInfo, attachmentKeys, attachmentData, bodyItemId } = params

  await setItemProcessing(bodyItemId)

  const aiStart = Date.now()

  try {
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

    // Detect if body is primarily a URL
    const detectedUrl = extractSingleUrl(parsed.bodyText)
    const youtubeId = detectedUrl ? extractYouTubeId(detectedUrl) : null

    let sourceType: SourceType | null = null
    let sourceUrl: string | null = null
    let thumbnailUrl: string | null = null
    let summarizeSubject = parsed.subject
    let summarizeBody = parsed.bodyText

    if (detectedUrl && youtubeId) {
      sourceType = 'youtube'
      sourceUrl = detectedUrl
      thumbnailUrl = getYouTubeThumbnailUrl(youtubeId)
      const videoTitle = await fetchYouTubeTitle(detectedUrl)
      summarizeSubject = videoTitle ?? parsed.subject
      summarizeBody = `YouTube video: ${videoTitle ?? detectedUrl}`
      console.log(`[ingest] Detected YouTube video: ${youtubeId} — "${summarizeSubject}"`)
    } else if (detectedUrl) {
      sourceType = 'url'
      sourceUrl = detectedUrl
      console.log(`[ingest] Detected URL: ${detectedUrl}`)
    } else {
      sourceType = 'email'
    }

    // Summarize body
    const bodyResult = await summarizeEmailBody(summarizeSubject, summarizeBody)
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

        if (!isAllowedMimeType(attachment.mimeType)) {
          // skip unsupported mime types
        } else if (attachment.mimeType.startsWith('image/')) {
          const desc = await describeImage(attachment.data, attachment.mimeType)
          aiSummary = desc.description
        } else if (attachment.mimeType === 'application/pdf') {
          const pdfResult = await extractPdfText(attachment.data)
          if (pdfResult.text) {
            const sumResult = await summarizeEmailBody(attachment.filename, pdfResult.text)
            aiSummary = sumResult.summary
            aiTags = sumResult.tags
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        await setItemFailed(attachItemId, msg)
      }
    }

    return { itemIds, status: 'done', aiMs }
  } catch (err) {
    const aiMs = Date.now() - aiStart
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[ingest] processEmail unexpected error:', msg)
    try {
      await setItemFailed(bodyItemId, msg)
    } catch {
      // best-effort
    }
    return { itemIds: [bodyItemId], status: 'failed', aiMs }
  }
}
