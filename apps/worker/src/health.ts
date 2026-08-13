import { createServer, type Server } from 'node:http';

import { ERROR_CODES } from '@ikp/shared';
import type { Logger } from 'pino';

export interface HealthServerOptions {
  logger: Logger;
}

/**
 * Minimal health server for the worker process so that orchestrators can
 * probe liveness and readiness without requiring a queue connection.
 */
export function createHealthServer(options: HealthServerOptions): Server {
  const { logger } = options;

  return createServer((request, response) => {
    const send = (statusCode: number, body: unknown): void => {
      response.writeHead(statusCode, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    const url = new URL(request.url ?? '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/health') {
      send(200, {
        data: {
          status: 'ok',
          service: 'worker',
          uptime_seconds: Math.round(process.uptime()),
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/ready') {
      send(200, { data: { status: 'ok', checks: { process: 'up' } } });
      return;
    }

    send(404, {
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: 'Route not found.',
        details: {},
        request_id: 'worker-http',
      },
    });
  }).on('clientError', (error, socket) => {
    logger.warn({ err: error }, 'worker health server client error');
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });
}
