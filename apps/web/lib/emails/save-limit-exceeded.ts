import { SAVE_ACTIONS_FREE_LIMIT } from '@drop-note/shared'
import { getResend, getRedis } from './shared'

interface SaveLimitParams {
  to: string
  userId: string
  month: string // 'YYYY-MM'
}

export async function sendSaveLimitExceededEmail({
  to,
  userId,
  month,
}: SaveLimitParams): Promise<void> {
  const redis = getRedis()
  const suppressKey = `save-limit-exceeded:${userId}:${month}`

  // Rate-limit: send at most once per month per user (key expires with the month)
  const suppressed = await redis.exists(suppressKey)
  if (suppressed) return

  await redis.set(suppressKey, '1', { ex: 35 * 86400 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dropnote.com'

  await getResend().emails.send({
    from: process.env.RESEND_FROM_ADDRESS ?? 'drop-note <noreply@dropnote.com>',
    to,
    subject: "You've reached your monthly drop-note limit",
    html: `
      <p>Hi,</p>
      <p>You've used all ${SAVE_ACTIONS_FREE_LIMIT} save actions for this month on the free plan.</p>
      <p>Your limit resets at the start of next month.</p>
      <p><a href="${appUrl}/pricing">Upgrade to Pro</a> for unlimited saves, or wait until next month.</p>
      <p>— drop-note</p>
    `.trim(),
  })
}
