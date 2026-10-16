import { Resend } from 'resend'
import { requireEnv } from '@drop-note/shared'

let _resend: Resend | null = null
export function getResend(): Resend {
  if (!_resend) _resend = new Resend(requireEnv('RESEND_API_KEY'))
  return _resend
}
