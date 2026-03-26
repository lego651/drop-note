import 'dotenv/config'
import IORedis from 'ioredis'
import { Worker } from 'bullmq'
import { QUEUE_NAME } from '@drop-note/shared'
import { processEmail } from './processors/email'

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
})

const worker = new Worker(QUEUE_NAME, processEmail, {
  connection,
  concurrency: 2,
})

worker.on('completed', (job) => {
  console.log(`[worker] Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message)
})

console.log(`Worker started, listening on queue: ${QUEUE_NAME}`)

async function shutdown() {
  console.log('[worker] Shutting down gracefully...')
  await worker.close()
  await connection.quit()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
