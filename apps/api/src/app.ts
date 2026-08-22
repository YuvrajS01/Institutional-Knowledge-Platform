import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
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
import { registerBookmarksRoutes } from './modules/bookmarks/bookmarks.route.js';
import { registerDatesRoutes } from './modules/dates/dates.route.js';
import { registerNotificationsRoutes } from './modules/notifications/notifications.route.js';
import { registerRelatedDocumentsRoutes } from './modules/documents/related-documents.route.js';
import { registerShareLinksRoutes } from './modules/documents/share-links.route.js';
import { registerUnresolvedSearchesRoutes } from './modules/search/unresolved-searches.route.js';
import { registerAnalyticsRoutes } from './modules/admin/analytics.route.js';
import { AuditLogService } from './modules/audit/audit-log.service.js';
import { metrics } from './infrastructure/metrics/metrics.js';
import { registerMetricsRoutes } from './infrastructure/metrics/metrics.route.js';
import type { JobQueue } from '@ikp/queue';

export function parseCorsOrigins(raw?: string): string[] {
  if (!raw || !raw.trim()) {
    return ['http://localhost:3000'];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

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
  /** Explicit CORS allow-list. When omitted, `CORS_ORIGINS` env / default is used. */
  corsOrigins?: string[];
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    loggerInstance: options.loggerInstance,
    genReqId: () => generateRequestId(),
    trustProxy: true,
  });

  const isProduction = process.env.NODE_ENV === 'production';

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    hidePoweredBy: true,
  });

  const allowedOrigins =
    options.corsOrigins ?? parseCorsOrigins(process.env.CORS_ORIGINS);
  const allowedSet = new Set(allowedOrigins);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedSet.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Institution-Id', 'Idempotency-Key'],
    credentials: true,
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
  registerMetricsRoutes(app);

  // Metrics / tracing: request id, latency, status (P9-005)
  app.addHook('onResponse', async (request, reply) => {
    const latency = reply.elapsedTime;
    metrics.record(reply.statusCode, latency);
    // Structured log for tracing (request_id, method, url, status, latency)
    request.log.info(
      {
        request_id: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        latency_ms: Math.round(latency * 100) / 100,
      },
      'request completed',
    );
  });

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
        await registerUnresolvedSearchesRoutes(v1, { pool: options.pool!, authorization });
        await registerAiRoutes(v1, { pool: options.pool!, authorization });
        await registerBookmarksRoutes(v1, { pool: options.pool!, authorization });
        await registerRelatedDocumentsRoutes(v1, { pool: options.pool!, authorization });
        await registerShareLinksRoutes(v1, { pool: options.pool!, authorization });
        await registerDatesRoutes(v1, { pool: options.pool!, authorization });
        await registerNotificationsRoutes(v1, { pool: options.pool!, authorization });
        await registerAnalyticsRoutes(v1, { pool: options.pool!, authorization });
        await registerAuditRoutes(v1, { pool: options.pool!, authorization });
      },
      { prefix: '/api/v1' },
    );
  }

  return app;
}
