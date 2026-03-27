import { escapeHtml } from '@drop-note/shared'
import { getResend, getRedis } from './shared'

interface CapExceededParams {
  to: string
  userId: string
  tier: string
  currentCount: number
  tierLimit: number
  emailSubject: string
}

export async function sendCapExceededEmail({
  to,
  userId,
  tier,
  currentCount,
  tierLimit,
  emailSubject,
}: CapExceededParams): Promise<void> {
  const redis = getRedis()
  const suppressKey = `cap-exceeded:${userId}`

  // Rate-limit: send at most once per hour per user
  const suppressed = await redis.exists(suppressKey)
  if (suppressed) return

  await redis.set(suppressKey, '1', { ex: 3600 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dropnote.com'

  await getResend().emails.send({
    from: process.env.RESEND_FROM_ADDRESS ?? 'drop-note <noreply@dropnote.com>',
    to,
    subject: 'Your drop-note inbox is full',
    html: `
      <p>Hi,</p>
      <p>Your <strong>${tier}</strong> plan stores up to <strong>${tierLimit} items</strong>. You currently have <strong>${currentCount} items</strong>.</p>
      <p>The email you tried to send (<em>${escapeHtml(emailSubject || '(no subject)')}</em>) was not saved.</p>
      <p><a href="${appUrl}/pricing">Upgrade your plan</a> to save more items, or delete some from your dashboard to make room.</p>
      <p>— drop-note</p>
    `.trim(),
  })
}
