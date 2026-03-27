import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import {
  parseFromAddress,
  isOverRateLimit,
  QUEUE_NAME,
  TIER_ITEM_LIMITS,
  TIER_ATTACHMENT_SIZE_MB,
  SAVE_ACTIONS_FREE_LIMIT,
  getCurrentMonth,
  isAllowedMimeType,
  type EmailJobPayload,
} from '@drop-note/shared'
import { timingSafeEqual } from 'crypto'
import { sendCapExceededEmail } from '../../../lib/emails/cap-exceeded'
import { sendSaveLimitExceededEmail } from '../../../lib/emails/save-limit-exceeded'
import { supabaseAdmin } from '../../../lib/supabase/admin'

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

let _queue: Queue | null = null

function getQueue(): Queue {
  if (!_queue) {
    const connection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: true,
    })
    _queue = new Queue(QUEUE_NAME, { connection })
  }
  return _queue
}

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a)
    const bBuf = Buffer.from(b)
    if (aBuf.length !== bBuf.length) return false
    return timingSafeEqual(aBuf, bBuf)
  } catch {
    return false
  }
}

/**
 * Count how many items this email would create.
 * = 1 (email body) + valid attachments (allowed MIME type + within size limit for tier)
 * Oversized attachments are excluded — they'll be dropped by the worker anyway.
 */
function countIncomingItems(
  attachmentInfo: string,
  attachmentData: Record<string, string>,
  tier: keyof typeof TIER_ATTACHMENT_SIZE_MB,
): number {
  const sizeLimitBytes = TIER_ATTACHMENT_SIZE_MB[tier] * 1_000_000
  let count = 1 // email body always counts

  if (!attachmentInfo) return count

  let parsed: Record<string, { filename?: string; type?: string }> = {}
  try {
    parsed = JSON.parse(attachmentInfo)
  } catch {
    return count
  }

  for (const key of Object.keys(parsed)) {
    const info = parsed[key]
    const mimeType = info?.type ?? ''
    if (!isAllowedMimeType(mimeType)) continue

    const base64Data = attachmentData[key] ?? ''
    const sizeBytes = Math.floor(base64Data.length * 0.75)
    if (sizeBytes > sizeLimitBytes) continue // oversized — exclude from count

    count++
  }

  return count
}

// Lua script for atomic check-and-increment (prevents race conditions)
// Returns -1 if limit would be exceeded, otherwise returns new total
const ATOMIC_SAVE_INCR_SCRIPT = `
local key = KEYS[1]
local incoming = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local current = tonumber(redis.call('GET', key) or 0)
if current + incoming > limit then return -1 end
local new = redis.call('INCRBY', key, incoming)
redis.call('EXPIRE', key, ttl)
return new
`

export async function POST(request: Request) {
  // Always 200 to SendGrid — never let it retry on error
  try {
    // Auth check
    const url = new URL(request.url)
    const key = url.searchParams.get('key') ?? ''
    const secret = process.env.SENDGRID_INGEST_SECRET ?? ''
    if (!secret || !timingSafeCompare(key, secret)) {
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    // Content-Length guard (20MB)
    const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10)
    if (contentLength > 20_971_520) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const formData = await request.formData()

    const from = (formData.get('from') as string) ?? ''
    const subject = (formData.get('subject') as string) ?? ''
    const text = (formData.get('text') as string) ?? ''
    const html = (formData.get('html') as string) ?? ''
    const attachmentInfo = (formData.get('attachment-info') as string) ?? ''

    const attachmentKeys: string[] = []
    const attachmentData: Record<string, string> = {}
    for (const [k, value] of formData.entries()) {
      if (/^attachment\d+$/.test(k)) {
        if (value instanceof File) {
          const buffer = Buffer.from(await value.arrayBuffer())
          attachmentKeys.push(k)
          attachmentData[k] = buffer.toString('base64')
        } else if (typeof value === 'string' && value.length > 0) {
          // Fallback for test payloads that send pre-encoded base64 strings
          attachmentKeys.push(k)
          attachmentData[k] = value
        }
      }
    }

    const senderEmail = parseFromAddress(from)
    if (!senderEmail) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const supabase = supabaseAdmin

    // Block list check — must run BEFORE user lookup
    const { data: blocked } = await supabase
      .from('block_list')
      .select('id')
      .eq('type', 'email')
      .eq('value', senderEmail)
      .maybeSingle()

    if (blocked) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // User lookup
    const { data: user } = await supabase
      .from('users')
      .select('id, tier, email')
      .eq('email', senderEmail)
      .maybeSingle()

    if (!user) {
      // Track unknown sender attempts; auto-block after 10 within 24h
      try {
        const abuseRedis = getRedis()
        const abuseKey = `abuse:unknown_sender:${senderEmail}`
        const attempts = await abuseRedis.incr(abuseKey)
        if (attempts === 1) {
          await abuseRedis.expire(abuseKey, 86400) // 24hr TTL on first increment
        }
        if (attempts >= 10) {
          await supabase
            .from('block_list')
            .upsert(
              { type: 'email', value: senderEmail, created_by: null },
              { onConflict: 'type,value', ignoreDuplicates: true }
            )
        }
      } catch (err) {
        console.error('[ingest] Auto-block redis error:', err)
        // Continue — Redis failure must not prevent normal ingest flow
      }
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Rate limit (hourly)
    const redis = getRedis()
    const rateLimitKey = `ratelimit:email:${user.id}`
    const pipeline = redis.pipeline()
    pipeline.incr(rateLimitKey)
    pipeline.expire(rateLimitKey, 3600)
    const results = await pipeline.exec()
    const count = results[0] as number

    if (isOverRateLimit(count, user.tier)) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // S306 — Item cap enforcement
    const incomingCount = countIncomingItems(attachmentInfo, attachmentData, user.tier)

    const { count: currentItemCount } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null)

    const activeItems = currentItemCount ?? 0
    const tierLimit = TIER_ITEM_LIMITS[user.tier]

    if (activeItems >= tierLimit || activeItems + incomingCount > tierLimit) {
      // Fire-and-forget cap exceeded notification
      sendCapExceededEmail({
        to: user.email,
        userId: user.id,
        tier: user.tier,
        currentCount: activeItems,
        tierLimit,
        emailSubject: subject,
      }).catch((err) => console.error('[ingest] Failed to send cap-exceeded email:', err))

      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // S308 — Monthly save action limit (free tier only)
    if (user.tier === 'free') {
      const month = getCurrentMonth()
      const saveKey = `saves:${user.id}:${month}`
      const TTL_35_DAYS = 35 * 86400

      let saveCheckPassed = true
      try {
        const newTotal = await redis.eval(
          ATOMIC_SAVE_INCR_SCRIPT,
          [saveKey],
          [incomingCount, SAVE_ACTIONS_FREE_LIMIT, TTL_35_DAYS],
        ) as number

        if (newTotal === -1) {
          saveCheckPassed = false
          sendSaveLimitExceededEmail({
            to: user.email,
            userId: user.id,
            month,
          }).catch((err) => console.error('[ingest] Failed to send save-limit email:', err))
        }
      } catch (err) {
        // Fail open: better to allow one extra email than silently discard it
        console.error('[ingest] Redis save-limit check failed — allowing email through:', err)
      }

      if (!saveCheckPassed) {
        return NextResponse.json({ ok: true }, { status: 200 })
      }
    }

    // Create pending item
    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({
        user_id: user.id,
        subject: subject || '(no subject)',
        sender_email: senderEmail,
        type: 'email_body',
        status: 'pending',
      })
      .select('id')
      .single()

    if (itemError || !item) {
      console.error('[ingest] Failed to create pending item:', itemError?.message)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Enqueue BullMQ job
    const queue = getQueue()

    const payload: EmailJobPayload = {
      userId: user.id,
      userTier: user.tier,
      from,
      subject,
      text,
      html,
      attachmentInfo,
      attachmentKeys,
      attachmentData,
      bodyItemId: item.id,
      receivedAt: new Date().toISOString(),
    }

    await queue.add('process-email', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    })

    // S308 — Fire-and-forget usage_log write (for admin reporting)
    if (user.tier === 'free') {
      const month = getCurrentMonth()
      supabase
        .from('usage_log')
        .insert({ user_id: user.id, action_type: 'save', month })
        .then(({ error }) => {
          if (error) console.error('[ingest] usage_log write failed:', error.message)
        })
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[ingest] Unhandled error:', err)
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}
