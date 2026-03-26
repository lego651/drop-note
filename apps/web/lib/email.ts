import { Resend } from 'resend'

export async function sendWelcomeEmail(toEmail: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_ADDRESS ?? 'drop-note <hello@dropnote.com>',
      to: toEmail,
      subject: 'Welcome to drop-note — your drop address is ready',
      html: `
        <p>Hi,</p>
        <p>Welcome to <strong>drop-note</strong>! Your drop address is ready to use.</p>
        <p style="font-size: 20px; font-weight: bold; padding: 16px; background: #f5f5f5; border-radius: 8px;">
          drop@dropnote.com
        </p>
        <p>Forward any email to that address and it will appear in your dashboard with an AI-generated summary and tags.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://dropnote.com'}/dashboard">Open your dashboard →</a></p>
        <p>Happy saving,<br>The drop-note team</p>
      `,
    })
  } catch (err) {
    // Never throw — don't break sign-in flow
    console.error('[email] Failed to send welcome email:', err)
  }
}
