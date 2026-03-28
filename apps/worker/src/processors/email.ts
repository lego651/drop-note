import { Job } from 'bullmq'
import {
  EmailJobPayload,
  EmailJobResult,
  parseSendGridPayload,
  isAllowedMimeType,
  extractSingleUrl,
  extractYouTubeId,
  getYouTubeThumbnailUrl,
  fetchYouTubeTitle,
} from '@drop-note/shared'
import type { SourceType } from '@drop-note/shared'
import { setItemProcessing, setItemDone, setItemFailed, upsertTags, createAttachmentItem } from '../lib/db'
import { uploadAttachment } from '../lib/storage'
import { summarizeEmailBody, describeImage } from '../lib/openai'
import { extractPdfText } from '../lib/pdf'

export async function processEmail(job: Job<EmailJobPayload>): Promise<EmailJobResult> {
  const { userId, userTier, from, subject, text, html, attachmentInfo, attachmentKeys, attachmentData, bodyItemId } = job.data

  console.log(`[processor] Processing job ${job.id} for user ${userId}`)

  // Mark body item as processing
  await setItemProcessing(bodyItemId)

  try {
    // Build field map for parsing
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
      // Fetch title via oEmbed so the AI has something meaningful to summarize
      const videoTitle = await fetchYouTubeTitle(detectedUrl)
      summarizeSubject = videoTitle ?? parsed.subject
      summarizeBody = `YouTube video: ${videoTitle ?? detectedUrl}`
      console.log(`[processor] Detected YouTube video: ${youtubeId} — "${summarizeSubject}"`)
    } else if (detectedUrl) {
      sourceType = 'url'
      sourceUrl = detectedUrl
      console.log(`[processor] Detected URL: ${detectedUrl}`)
    } else {
      sourceType = 'email'
    }

    // Summarize body
    const bodyResult = await summarizeEmailBody(summarizeSubject, summarizeBody)

    if (bodyResult.error) {
      if (bodyResult.error === 'Invalid AI response format') {
        // Non-retryable parse error — mark failed and continue
        await setItemFailed(bodyItemId, bodyResult.error)
      } else {
        // Transient AI service error — rethrow so BullMQ retries the job
        // The outer catch will mark the item failed and rethrow
        throw new Error(bodyResult.error)
      }
    } else {
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
        // Upload file
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
          } else if (pdfResult.error) {
            aiSummary = ''
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

    return { itemIds, status: 'done' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await setItemFailed(bodyItemId, msg)
    throw err // BullMQ will retry
  }
}
