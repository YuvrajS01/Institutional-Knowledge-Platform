import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { registerErrorHandlers } from './common/error-handler.js';
import { generateRequestId } from './common/request-id.js';
import { registerHealthRoutes, type ReadinessChecks } from './modules/health/health.route.js';

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
  loggerInstance?: FastifyServerOptions['loggerInstance'];
  checks?: ReadinessChecks;
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

  registerErrorHandlers(app);
  registerHealthRoutes(app, options.checks);

  return app;
}
