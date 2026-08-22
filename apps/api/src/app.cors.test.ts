import { afterEach, describe, expect, it } from 'vitest';

import { buildApp, parseCorsOrigins } from './app.js';

const apps: { close: () => Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('parseCorsOrigins', () => {
  it('defaults to localhost:3000 when empty', () => {
    expect(parseCorsOrigins(undefined)).toEqual(['http://localhost:3000']);
    expect(parseCorsOrigins('')).toEqual(['http://localhost:3000']);
    expect(parseCorsOrigins('  ')).toEqual(['http://localhost:3000']);
  });

  it('splits comma-separated origins and trims', () => {
    expect(parseCorsOrigins('http://localhost:3000, https://app.example.edu ')).toEqual([
      'http://localhost:3000',
      'https://app.example.edu',
    ]);
  });

  it('ignores empty entries', () => {
    expect(parseCorsOrigins('http://a.example, , http://b.example')).toEqual([
      'http://a.example',
      'http://b.example',
    ]);
  });
});

describe('CORS allow-list', () => {
  it('allows configured origin and reflects it', async () => {
    const app = await buildApp({
      logger: false,
      corsOrigins: ['http://localhost:3000', 'https://app.example.edu'],
    });
    apps.push(app);

    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://app.example.edu' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.edu');
  });

  it('does not reflect a disallowed origin', async () => {
    const app = await buildApp({
      logger: false,
      corsOrigins: ['http://localhost:3000'],
    });
    apps.push(app);

    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows requests without Origin header (same-origin / curl)', async () => {
    const app = await buildApp({
      logger: false,
      corsOrigins: ['http://localhost:3000'],
    });
    apps.push(app);

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('handles preflight OPTIONS for allowed origin', async () => {
    const app = await buildApp({
      logger: false,
      corsOrigins: ['http://localhost:3000'],
    });
    apps.push(app);

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'GET',
      },
    });

    // fastify/cors responds 204 for allowed preflight
    expect([200, 204]).toContain(res.statusCode);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not allow preflight for disallowed origin', async () => {
    const app = await buildApp({
      logger: false,
      corsOrigins: ['http://localhost:3000'],
    });
    apps.push(app);

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'GET',
      },
    });

    // Even for disallowed, server still returns 204 but without ACAO header
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
