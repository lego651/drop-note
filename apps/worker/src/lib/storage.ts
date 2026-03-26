import { supabaseAdmin } from './supabase'
import { enforceAttachmentSizeLimit } from '@drop-note/shared'

interface UploadParams {
  userId: string
  itemId: string
  filename: string
  mimeType: string
  data: string  // base64
  tier: 'free' | 'pro' | 'power'
}

interface UploadResult {
  storagePath: string | null
  error: string | null
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\]/g, '_').replace(/\s+/g, '_')
}

export async function uploadAttachment(params: UploadParams): Promise<UploadResult> {
  const { userId, itemId, filename, mimeType, data, tier } = params

  // Compute decoded size
  const size = Math.floor(data.length * 0.75)
  const withinLimit = enforceAttachmentSizeLimit({ filename, mimeType, data, size }, tier)

  if (!withinLimit) {
    return {
      storagePath: null,
      error: `File "${filename}" exceeds the ${tier} tier size limit`,
    }
  }

  const safeName = sanitizeFilename(filename)
  const storagePath = `attachments/${userId}/${itemId}/${safeName}`
  const buffer = Buffer.from(data, 'base64')

  const { error } = await supabaseAdmin.storage
    .from('attachments')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false })

  if (error) {
    return { storagePath: null, error: error.message }
  }

  return { storagePath, error: null }
}
