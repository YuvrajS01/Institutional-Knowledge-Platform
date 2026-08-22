import { describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';

describe('Metrics / tracing (P9-005)', () => {
  it('exposes /metrics with snapshot and records requests', async () => {
    const app = await buildApp({ logger: false });

    const res1 = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json() as { data: { requests_total: number; avg_latency_ms: number } };
    expect(typeof body1.data.requests_total).toBe('number');
    expect(typeof body1.data.avg_latency_ms).toBe('number');

    // Make a couple of requests to generate metrics
    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/metrics' });

    const res2 = await app.inject({ method: 'GET', url: '/metrics' });
    const body2 = res2.json() as {
      data: { requests_total: number; responses_by_status: Record<string, number> };
    };
    expect(body2.data.requests_total).toBeGreaterThan(body1.data.requests_total);
    expect(body2.data.responses_by_status['200']).toBeGreaterThan(0);

    await app.close();
  });

  it('exposes prometheus text format', async () => {
    const app = await buildApp({ logger: false });
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('http_requests_total');
    await app.close();
  });
});
