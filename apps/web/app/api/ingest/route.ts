import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import {
  parseFromAddress,
  isOverRateLimit,
  QUEUE_NAME,
  type EmailJobPayload,
} from '@drop-note/shared'
import type { Database } from '@drop-note/shared'
import { timingSafeEqual } from 'crypto'

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
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
      if (/^attachment\d+$/.test(k) && typeof value === 'string') {
        attachmentKeys.push(k)
        attachmentData[k] = value
      }
    }

    const senderEmail = parseFromAddress(from)
    if (!senderEmail) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const supabase = getAdminClient()

    // User lookup
    const { data: user } = await supabase
      .from('users')
      .select('id, tier')
      .eq('email', senderEmail)
      .maybeSingle()

    if (!user) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Block list check
    const { data: blocked } = await supabase
      .from('block_list')
      .select('id')
      .eq('type', 'email')
      .eq('value', senderEmail)
      .maybeSingle()

    if (blocked) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Rate limit
    const redis = getRedis()
    const rateLimitKey = `ratelimit:email:${user.id}`
    const count = await redis.incr(rateLimitKey)
    if (count === 1) {
      await redis.expire(rateLimitKey, 3600)
    }

    if (isOverRateLimit(count, user.tier)) {
      return NextResponse.json({ ok: true }, { status: 200 })
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
    const connection = new IORedis(process.env.REDIS_URL!, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      lazyConnect: true,
    })

    const queue = new Queue(QUEUE_NAME, { connection })

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

    await queue.close()
    connection.disconnect()

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[ingest] Unhandled error:', err)
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}
