import { loadEnvFile, parseEnv, workerEnvSchema } from '@ikp/config';
import { createTextExtractor, createOcrProvider } from '@ikp/processing';
import { createJobWorker } from '@ikp/queue';
import { createS3ObjectStorage } from '@ikp/storage';
import { Pool } from 'pg';
import pino from 'pino';

import { createHealthServer } from './health.js';
import { ProcessingService } from './processing/processing.service.js';

const QUEUE_PREFIX = 'ikp';

async function main(): Promise<void> {
  loadEnvFile();
  const env = parseEnv(workerEnvSchema);

  const logger = pino({ level: env.LOG_LEVEL, base: { service: 'worker' } });

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const storage = createS3ObjectStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  });

  const processing = new ProcessingService(
    pool,
    storage,
    createTextExtractor(),
    createOcrProvider(),
  );

  const worker = createJobWorker(
    { connectionUrl: env.REDIS_URL, prefix: QUEUE_PREFIX, name: 'document.process' },
    (data) => processing.processJob(data),
  );
  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, documentId: job.data.document_id }, 'document.process completed');
  });
  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, documentId: job?.data.document_id, err: error.message },
      'document.process failed',
    );
  });

  const server = createHealthServer({ logger });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    await worker.close();
    await pool.end();
    server.close((error) => {
      if (error) {
        logger.error({ err: error }, 'error closing health server');
        process.exitCode = 1;
      }
      process.exit(process.exitCode ?? 0);
    });
    setTimeout(() => {
      logger.warn('forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  server.listen(env.WORKER_PORT, env.WORKER_HOST, () => {
    logger.info({ host: env.WORKER_HOST, port: env.WORKER_PORT }, 'worker health server started');
    logger.info('worker started; consuming document.process jobs');
  });
}

void main();
