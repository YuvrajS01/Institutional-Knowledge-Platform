import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import type { ReadinessChecks } from './health.route.js';

const up = async (): Promise<void> => {
  await Promise.resolve();
};
const down = async (): Promise<void> => {
  throw new Error('connection refused');
};

const apps: { close: () => Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function makeApp(checks: ReadinessChecks = { database: up, redis: up }) {
  const app = await buildApp({ logger: false, checks });
  apps.push(app);
  return app;
}

describe('health endpoints', () => {
  it('GET /health returns liveness status', async () => {
    const app = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('ok');
    expect(body.data.service).toBe('api');
    expect(typeof body.data.timestamp).toBe('string');
  });

  it('GET /ready returns ok when all checks pass', async () => {
    const app = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('ok');
    expect(body.data.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('GET /ready returns 503 when a check fails', async () => {
    const app = await makeApp({ database: down, redis: up });
    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.details.checks.database).toBe('down');
    expect(body.error.details.checks.redis).toBe('up');
  });

  it('GET /ready reports unconfigured checks as not_configured', async () => {
    const app = await makeApp({ database: undefined, redis: undefined });
    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.checks).toEqual({ database: 'not_configured', redis: 'not_configured' });
  });
});

describe('error envelope', () => {
  it('returns a consistent error envelope for unknown routes', async () => {
    const app = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Route not found.');
    expect(body.error.request_id).toMatch(/^req_/);
    expect(body.error.details).toBeDefined();
  });
});
