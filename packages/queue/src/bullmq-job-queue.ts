import { Job, Queue, Worker, type WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';

import {
  buildJobData,
  type EnqueueJobInput,
  type JobData,
  type JobHandler,
  type JobQueue,
} from './job-queue.js';

export interface BullMQJobQueueOptions {
  /** redis:// URL used for both the producer and consumer connections. */
  connectionUrl: string;
  /** Redis key prefix for queue names (e.g. "ikp"). */
  prefix?: string;
}

/**
 * BullMQ/Redis implementation of the job queue.
 *
 * Retry/observability: `attempts` + exponential backoff are configured per
 * job; BullMQ exposes job state (waiting/active/completed/failed) out of the
 * box. Idempotency: callers pass a deterministic `jobId` (e.g.
 * `<documentId>-<versionId>-<name>`); BullMQ will not enqueue a duplicate
 * job for the same id.
 */
export class BullMQJobQueue implements JobQueue {
  private readonly connection: Redis;
  private readonly queues = new Map<string, Queue>();
  private readonly prefix: string;

  constructor(private readonly options: BullMQJobQueueOptions) {
    this.prefix = options.prefix ?? 'ikp';
    this.connection = new Redis(options.connectionUrl, {
      maxRetriesPerRequest: null,
    });
  }

  async enqueue(input: EnqueueJobInput): Promise<void> {
    const queue = this.queueFor(input.name);
    const data = buildJobData(input);
    await queue.add(input.name, data, {
      jobId: input.jobId,
      attempts: input.attempts ?? 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 1000 },
    });
  }

  private queueFor(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.connection,
        prefix: this.prefix,
      });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
    this.connection.disconnect();
  }
}

export interface CreateWorkerOptions extends BullMQJobQueueOptions {
  /** Queue name to consume. */
  name: string;
  /** Concurrent jobs per worker. */
  concurrency?: number;
}

/**
 * Creates a BullMQ worker that runs `handler` for jobs on `name`, verifying
 * the tenant-aware payload shape before invoking it.
 */
export function createJobWorker(options: CreateWorkerOptions, handler: JobHandler): Worker {
  const workerOptions: WorkerOptions = {
    connection: {
      url: options.connectionUrl,
      maxRetriesPerRequest: null,
    } as unknown as WorkerOptions['connection'],
    prefix: options.prefix ?? 'ikp',
    concurrency: options.concurrency ?? 1,
  };

  return new Worker(
    options.name,
    async (job: Job<JobData>) => {
      const data = job.data;
      if (
        !data ||
        typeof data.institution_id !== 'string' ||
        typeof data.document_id !== 'string' ||
        typeof data.version_id !== 'string'
      ) {
        throw new Error(`Malformed job payload for ${options.name}.`);
      }
      await handler(data);
    },
    workerOptions,
  );
}
