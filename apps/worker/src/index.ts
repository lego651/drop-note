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

process.on('SIGTERM', async () => {
  await worker.close()
  await connection.quit()
})
