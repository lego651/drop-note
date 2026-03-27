import { Resend } from 'resend'
import { Redis } from '@upstash/redis'
import { requireEnv } from '@drop-note/shared'

let _resend: Resend | null = null
export function getResend(): Resend {
  if (!_resend) _resend = new Resend(requireEnv('RESEND_API_KEY'))
  return _resend
}

let _redis: Redis | null = null
export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: requireEnv('UPSTASH_REDIS_REST_URL'),
      token: requireEnv('UPSTASH_REDIS_REST_TOKEN'),
    })
  }
  return _redis
}
