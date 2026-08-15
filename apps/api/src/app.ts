import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { ERROR_CODES } from '@ikp/shared';

import { registerErrorHandlers } from './common/error-handler.js';
import { AppError } from './common/errors.js';
import { generateRequestId } from './common/request-id.js';
import type { DbPool } from './infrastructure/db/db-pool.js';
import { registerHealthRoutes, type ReadinessChecks } from './modules/health/health.route.js';
import { registerAuthRoutes, type AuthModuleOptions } from './modules/auth/auth.route.js';

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
  loggerInstance?: FastifyServerOptions['loggerInstance'];
  checks?: ReadinessChecks;
  pool?: DbPool;
  auth?: AuthModuleOptions;
  /** Overrides the default per-route rate limit used by auth endpoints. */
  authRateLimit?: { max: number; timeWindow: string };
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    loggerInstance: options.loggerInstance,
    genReqId: () => generateRequestId(),
  });

  await app.register(cors, {
    origin: true,
  });

  await app.register(rateLimit, {
    global: false,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: () =>
      new AppError(ERROR_CODES.RATE_LIMITED, 'Too many requests, please try again later.', 429),
  });

  registerErrorHandlers(app);
  registerHealthRoutes(app, options.checks);

  if (options.pool && options.auth) {
    await app.register(
      async (v1) => {
        await registerAuthRoutes(v1, {
          pool: options.pool!,
          tokenConfig: options.auth!.tokenConfig,
          rateLimit: options.authRateLimit,
        });
      },
      { prefix: '/api/v1' },
    );
  }

  return app;
}
