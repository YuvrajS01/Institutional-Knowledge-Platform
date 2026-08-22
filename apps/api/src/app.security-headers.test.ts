import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

const apps: { close: () => Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('security headers (helmet)', () => {
  it('sets X-Frame-Options DENY', async () => {
    const app = await buildApp({ logger: false });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('sets X-Content-Type-Options nosniff', async () => {
    const app = await buildApp({ logger: false });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets Referrer-Policy strict-origin-when-cross-origin', async () => {
    const app = await buildApp({ logger: false });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('sets Content-Security-Policy with frame-ancestors none', async () => {
    const app = await buildApp({ logger: false });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    const csp = res.headers['content-security-policy'] as string | undefined;
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
  });

  it('hides X-Powered-By', async () => {
    const app = await buildApp({ logger: false });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('does not set HSTS in non-production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const app = await buildApp({ logger: false });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['strict-transport-security']).toBeUndefined();
    process.env.NODE_ENV = prev;
  });

  it('sets HSTS in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const app = await buildApp({ logger: false });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    process.env.NODE_ENV = prev;
  });

  it('still respects CORS allow-list after helmet', async () => {
    const app = await buildApp({
      logger: false,
      corsOrigins: ['http://localhost:3000'],
    });
    apps.push(app);

    const allowed = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const blocked = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
