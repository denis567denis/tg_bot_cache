import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null, // Добавляем эту настройку
  enableReadyCheck: false,
});

enum JobType {
  NOTIFICATION = 'notification',
  MESSAGE_PROCESSING = 'message_processing'
}

class UnifiedQueue {
  private queue: Queue;
  private workers: Map<string, Worker>;
  private queueEvents: QueueEvents;

  constructor() {
    this.queue = new Queue('main_queue', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 1000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
      }
    });

    this.workers = new Map();
    this.queueEvents = new QueueEvents('main_queue', { connection: redisConnection });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.queueEvents.on('completed', ({ jobId }) => {
      console.log(`Job ${jobId} completed`);
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      console.log(`Job ${jobId} failed: ${failedReason}`);
    });
  }

  public async addJob<T>(type: JobType, data: T, priority?: number) {
    return this.queue.add(type, data, {
      priority: priority || 1,
      jobId: `${type}_${Date.now()}`,
    });
  }

  public createWorker<T>(type: JobType, handler: (job: { data: T, }) => Promise<void>) {
    const worker = new Worker(
      'main_queue',
      async job => {
        if (job.name === type) {
          await handler(job);
        }
      },
      {
        connection: redisConnection,
        concurrency: 10,
        limiter: {
          max: 15,
          duration: 60*1000
        }
      }
    );

    this.workers.set(type, worker);
    return worker;
  }

  public async close() {
    await this.queue.close();
    await this.queueEvents.close();
    for (const [_, worker] of this.workers) {
      await worker.close();
    }
  }
}

export const unifiedQueue = new UnifiedQueue();
export { JobType };