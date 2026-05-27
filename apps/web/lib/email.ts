import { Resend } from 'resend'

interface DigestItem {
  id: string
  subject: string | null
  source_type: string | null
  created_at: string
}

export async function sendWeeklyDigestEmail({
  to,
  weekItems,
  resurfaceItems,
}: {
  to: string
  weekItems: DigestItem[]
  resurfaceItems: DigestItem[]
}): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dropnote.me'
  const count = weekItems.length
  const subject = `Your drop-note week — ${count} save${count === 1 ? '' : 's'} this week`

  const itemRow = (item: DigestItem) => {
    const title = item.subject ?? '(no subject)'
    const badge = item.source_type
      ? `<span style="display:inline-block;padding:1px 6px;background:#f0f0f0;border-radius:4px;font-size:11px;color:#666;margin-left:6px;">${item.source_type}</span>`
      : ''
    return `<li style="margin:6px 0;">${title}${badge}</li>`
  }

  const weekSection = `
    <h2 style="font-size:16px;font-weight:600;margin:24px 0 8px;">This week's saves</h2>
    <ul style="padding-left:20px;margin:0;">
      ${weekItems.map(itemRow).join('\n      ')}
    </ul>
    <p style="margin:12px 0;"><a href="${appUrl}/dashboard" style="color:#0070f3;">View all in dashboard →</a></p>
  `

  const resurfaceSection =
    resurfaceItems.length > 0
      ? `
    <h2 style="font-size:16px;font-weight:600;margin:24px 0 8px;">From the vault</h2>
    <ul style="padding-left:20px;margin:0;">
      ${resurfaceItems
        .map(
          (item) =>
            `<li style="margin:6px 0;">${item.subject ?? '(no subject)'} <a href="${appUrl}/dashboard" style="color:#0070f3;font-size:13px;">Re-read →</a></li>`
        )
        .join('\n      ')}
    </ul>
  `
      : ''

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
      <p style="margin-bottom:4px;">Hi,</p>
      <p style="margin-top:0;">Here's your drop-note weekly digest.</p>
      ${weekSection}
      ${resurfaceSection}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="font-size:13px;color:#888;">
        You're receiving this because you have weekly digest enabled.
        Manage in settings: <a href="${appUrl}/settings" style="color:#0070f3;">${appUrl}/settings</a>
      </p>
    </div>
  `.trim()

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_ADDRESS ?? 'drop-note <hello@dropnote.me>',
      to,
      subject,
      html,
    })
  } catch (err) {
    // Never throw — don't break cron flow
    console.error('[email] Failed to send weekly digest email:', err)
  }
}

export async function sendWelcomeEmail(toEmail: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_ADDRESS ?? 'drop-note <hello@dropnote.me>',
      to: toEmail,
      subject: 'Welcome to drop-note — your drop address is ready',
      html: `
        <p>Hi,</p>
        <p>Welcome to <strong>drop-note</strong>! Your drop address is ready to use.</p>
        <p style="font-size: 20px; font-weight: bold; padding: 16px; background: #f5f5f5; border-radius: 8px;">
          drop@dropnote.me
        </p>
        <p>Forward any email to that address and it will appear in your dashboard with an AI-generated summary and tags.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://dropnote.me'}/dashboard">Open your dashboard →</a></p>
        <p>Happy saving,<br>The drop-note team</p>
      `,
    })
  } catch (err) {
    // Never throw — don't break sign-in flow
    console.error('[email] Failed to send welcome email:', err)
  }
}
