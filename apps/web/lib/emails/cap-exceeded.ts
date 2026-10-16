import { escapeHtml } from '@drop-note/shared'
import { getResend } from './shared'
import { claimOnce } from '../counters'

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
  // Rate-limit: send at most once per hour per user
  if (!(await claimOnce(`cap-exceeded:${userId}`, 3600))) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dropnote.me'

  await getResend().emails.send({
    from: process.env.RESEND_FROM_ADDRESS ?? 'drop-note <noreply@dropnote.me>',
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
