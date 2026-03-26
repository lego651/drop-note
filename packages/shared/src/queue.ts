export const QUEUE_NAME = 'email-pipeline'

export interface EmailJobPayload {
  userId: string
  userTier: 'free' | 'pro' | 'power'
  from: string
  subject: string
  text: string
  html: string
  attachmentInfo: string   // raw JSON string from SendGrid "attachment-info" field
  attachmentKeys: string[] // ["attachment1", "attachment2", ...]
  attachmentData: Record<string, string> // key → base64 string
  bodyItemId: string       // pre-created pending item ID
  receivedAt: string       // ISO 8601
}

export interface EmailJobResult {
  itemIds: string[]
  status: 'done' | 'failed'
}
