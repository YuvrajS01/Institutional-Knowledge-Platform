import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { ERROR_CODES } from '@ikp/shared';

import { registerErrorHandlers } from './common/error-handler.js';
import { AppError } from './common/errors.js';
import { generateRequestId } from './common/request-id.js';
import { createAuthorization } from './common/auth/authorize.js';
import type { DbPool } from './infrastructure/db/db-pool.js';
import type { ObjectStorage } from './infrastructure/storage/object-storage.js';
import { registerHealthRoutes, type ReadinessChecks } from './modules/health/health.route.js';
import { registerAuthRoutes, type AuthModuleOptions } from './modules/auth/auth.route.js';
import { registerDepartmentsRoutes } from './modules/departments/departments.route.js';
import { registerInstitutionsRoutes } from './modules/institutions/institutions.route.js';
import { registerDocumentsRoutes } from './modules/documents/documents.route.js';
import { registerAuditRoutes } from './modules/audit/audit.route.js';
import { registerSearchRoutes } from './modules/search/search.route.js';
import { registerAiRoutes } from './modules/ai/ai.route.js';
import { registerDatesRoutes } from './modules/dates/dates.route.js';
import { AuditLogService } from './modules/audit/audit-log.service.js';
import type { JobQueue } from '@ikp/queue';

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
  loggerInstance?: FastifyServerOptions['loggerInstance'];
  checks?: ReadinessChecks;
  pool?: DbPool;
  auth?: AuthModuleOptions;
  storage?: ObjectStorage;
  queue?: JobQueue;
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
    const authorization = createAuthorization({
      jwtSecret: options.auth.tokenConfig.secret,
      pool: options.pool,
    });
    const audit = new AuditLogService(options.pool);

    await app.register(
      async (v1) => {
        await registerAuthRoutes(v1, {
          pool: options.pool!,
          tokenConfig: options.auth!.tokenConfig,
          rateLimit: options.authRateLimit,
        });
        await registerDepartmentsRoutes(v1, { pool: options.pool!, authorization });
        await registerInstitutionsRoutes(v1, { pool: options.pool!, authorization });
        if (options.storage) {
          await registerDocumentsRoutes(v1, {
            pool: options.pool!,
            storage: options.storage,
            audit,
            queue: options.queue,
            authorization,
          });
        }
        await registerSearchRoutes(v1, { pool: options.pool!, authorization });
        await registerAiRoutes(v1, { pool: options.pool!, authorization });
        await registerDatesRoutes(v1, { pool: options.pool!, authorization });
        await registerAuditRoutes(v1, { pool: options.pool!, authorization });
      },
      { prefix: '/api/v1' },
    );
  }

  return app;
}
