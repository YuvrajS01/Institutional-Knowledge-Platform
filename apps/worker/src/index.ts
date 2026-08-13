import { loadEnvFile, parseEnv, workerEnvSchema } from '@ikp/config';
import pino from 'pino';

import { createHealthServer } from './health.js';

async function main(): Promise<void> {
  loadEnvFile();
  const env = parseEnv(workerEnvSchema);

  const logger = pino({ level: env.LOG_LEVEL, base: { service: 'worker' } });

  const server = createHealthServer({ logger });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
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
    logger.info('worker shell started; queue processors arrive with the processing phase');
  });
}

void main();
