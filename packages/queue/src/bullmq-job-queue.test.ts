import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BullMQJobQueue, createJobWorker } from './bullmq-job-queue.js';
import type { JobData } from './job-queue.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const PREFIX = `ikp-test-${Date.now()}`;

let queue: BullMQJobQueue;

beforeAll(() => {
  queue = new BullMQJobQueue({ connectionUrl: REDIS_URL, prefix: PREFIX });
});

afterAll(async () => {
  await queue.close();
});

describe('BullMQ job queue (integration)', () => {
  it('delivers an enqueued job to the worker with the full payload', async () => {
    const received: JobData[] = [];
    const worker = createJobWorker(
      { connectionUrl: REDIS_URL, prefix: PREFIX, name: 'document.process' },
      async (data) => {
        received.push(data);
      },
    );
    await worker.waitUntilReady();

    await queue.enqueue({
      name: 'document.process',
      jobId: 'delivery-doc-v1',
      institutionId: 'inst-delivery',
      documentId: 'doc-delivery',
      versionId: 'ver-delivery',
      payload: { note: 'hello' },
    });

    const deadline = Date.now() + 10_000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      job_id: 'delivery-doc-v1',
      institution_id: 'inst-delivery',
      document_id: 'doc-delivery',
      version_id: 'ver-delivery',
      payload: { note: 'hello' },
    });

    await worker.close();
  });

  it('retries a failing job and succeeds on the next attempt', async () => {
    let attempts = 0;
    const attemptsMade: number[] = [];
    const worker = createJobWorker(
      { connectionUrl: REDIS_URL, prefix: PREFIX, name: 'document.ocr' },
      async () => {
        attemptsMade.push(attempts);
        attempts += 1;
        if (attempts === 1) {
          throw new Error('transient failure');
        }
      },
    );
    await worker.waitUntilReady();

    await queue.enqueue({
      name: 'document.ocr',
      jobId: 'retry-doc-v1',
      institutionId: 'inst-retry',
      documentId: 'doc-retry',
      versionId: 'ver-retry',
      attempts: 2,
    });

    const deadline = Date.now() + 15_000;
    while (attempts < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(attempts).toBe(2);
    expect(attemptsMade).toEqual([0, 1]);

    await worker.close();
  });

  it('does not enqueue a duplicate job for the same jobId', async () => {
    let processed = 0;
    const worker = createJobWorker(
      { connectionUrl: REDIS_URL, prefix: PREFIX, name: 'document.index' },
      async () => {
        processed += 1;
      },
    );
    await worker.waitUntilReady();

    const input = {
      name: 'document.index',
      jobId: 'idempotent-doc-v1',
      institutionId: 'inst-idem',
      documentId: 'doc-idem',
      versionId: 'ver-idem',
    };
    await queue.enqueue(input);
    await queue.enqueue(input);

    const deadline = Date.now() + 10_000;
    while (processed === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(processed).toBe(1);

    await worker.close();
  });
});
