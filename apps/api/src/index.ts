import { apiEnvSchema, loadEnvFile, parseEnv } from '@ikp/config';
import pino from 'pino';

import { buildApp } from './app.js';
import { createPool } from './infrastructure/db/pool.js';
import { createRedisClient } from './infrastructure/redis.js';

async function main(): Promise<void> {
  loadEnvFile();
  const env = parseEnv(apiEnvSchema);

  const logger = pino({ level: env.LOG_LEVEL, base: { service: 'api' } });

  const pool = createPool(env.DATABASE_URL);
  const redis = createRedisClient(env.REDIS_URL);

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
