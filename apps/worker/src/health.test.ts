import type { Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';
import { pino } from 'pino';

import { createHealthServer } from './health';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

async function startServer(): Promise<{ baseUrl: string }> {
  const logger = pino({ level: 'silent' });
  const server = createHealthServer({ logger });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a TCP address');
  }
  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

describe('worker health server', () => {
  it('GET /health returns liveness status', async () => {
    const { baseUrl } = await startServer();
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { status: string; service: string } };
    expect(body.data.status).toBe('ok');
    expect(body.data.service).toBe('worker');
  });

  it('GET /ready returns ok', async () => {
    const { baseUrl } = await startServer();
    const response = await fetch(`${baseUrl}/ready`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { status: string } };
    expect(body.data.status).toBe('ok');
  });

  it('returns the error envelope for unknown routes', async () => {
    const { baseUrl } = await startServer();
    const response = await fetch(`${baseUrl}/nope`);

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
