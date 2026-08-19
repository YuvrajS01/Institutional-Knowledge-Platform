import { apiEnvSchema, loadEnvFile, parseEnv } from '@ikp/config';
import { BullMQJobQueue } from '@ikp/queue';
import pino from 'pino';

import { buildApp } from './app.js';
import { createPool } from './infrastructure/db/pool.js';
import { createRedisClient } from './infrastructure/redis.js';
import { createS3ObjectStorage } from './infrastructure/storage/s3-object-storage.js';

async function main(): Promise<void> {
  loadEnvFile();
  const env = parseEnv(apiEnvSchema);

  const logger = pino({ level: env.LOG_LEVEL, base: { service: 'api' } });

  const pool = createPool(env.DATABASE_URL);
  const redis = createRedisClient(env.REDIS_URL);
  const storage = createS3ObjectStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  });
  const queue = new BullMQJobQueue({ connectionUrl: env.REDIS_URL, prefix: 'ikp' });

  const app = await buildApp({
    logger: false,
    loggerInstance: logger,
    checks: {
      database: async () => {
        await pool.query('SELECT 1');
      },
      redis: async () => {
        if (redis.status === 'wait' || redis.status === 'close' || redis.status === 'end') {
          await redis.connect();
        }
        await redis.ping();
      },
    },
    pool,
    storage,
    queue,
    auth: {
      pool,
      tokenConfig: {
        secret: env.JWT_SECRET,
        accessTtlMinutes: env.JWT_ACCESS_TTL_MINUTES,
        refreshTtlDays: env.JWT_REFRESH_TTL_DAYS,
      },
    },
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await pool.end();
      redis.disconnect();
    } catch (error) {
      logger.error({ err: error }, 'error during shutdown');
      process.exitCode = 1;
    }
    process.exit(process.exitCode ?? 0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: env.API_HOST, port: env.API_PORT });
    logger.info({ port: env.API_PORT, host: env.API_HOST }, 'API server started');
  } catch (error) {
    logger.error({ err: error }, 'failed to start API server');
    process.exitCode = 1;
    await shutdown('startup-failure');
  }
}

void main();
