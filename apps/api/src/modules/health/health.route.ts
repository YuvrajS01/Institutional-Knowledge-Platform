import type { FastifyInstance } from 'fastify';

import { ERROR_CODES } from '@ikp/shared';

export interface ReadinessChecks {
  database?: () => Promise<void>;
  redis?: () => Promise<void>;
}

type CheckStatus = 'up' | 'down' | 'not_configured';

interface CheckResult {
  [name: string]: CheckStatus;
}

export function registerHealthRoutes(app: FastifyInstance, checks: ReadinessChecks = {}): void {
  app.get('/health', async () => ({
    data: {
      status: 'ok',
      service: 'api',
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  }));

  app.get('/ready', async (_request, reply) => {
    const results: CheckResult = {};
    const failures: string[] = [];

    for (const [name, check] of Object.entries(checks)) {
      if (!check) {
        results[name] = 'not_configured';
        continue;
      }
      try {
        await check();
        results[name] = 'up';
      } catch {
        results[name] = 'down';
        failures.push(name);
      }
    }

    if (failures.length > 0) {
      return reply.status(503).send({
        error: {
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
          message: 'Service is not ready.',
          details: { checks: results, failed: failures },
          request_id: _request.id,
        },
      });
    }

    return {
      data: {
        status: 'ok',
        checks: results,
      },
    };
  });
}
