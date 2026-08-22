import type { FastifyInstance } from 'fastify';

import { metrics } from './metrics.js';

export function registerMetricsRoutes(app: FastifyInstance): void {
  app.get('/metrics', async () => ({
    data: metrics.snapshot(),
  }));

  // Prometheus-style plain text for scraping (optional)
  app.get('/metrics/prometheus', async (_request, reply) => {
    const snap = metrics.snapshot();
    const lines = [
      '# HELP http_requests_total Total HTTP requests',
      '# TYPE http_requests_total counter',
      `http_requests_total ${snap.requests_total}`,
      '# HELP http_errors_total Total 5xx responses',
      '# TYPE http_errors_total counter',
      `http_errors_total ${snap.errors_total}`,
      '# HELP http_avg_latency_ms Average latency ms',
      '# TYPE http_avg_latency_ms gauge',
      `http_avg_latency_ms ${snap.avg_latency_ms}`,
      '# HELP http_p95_latency_ms p95 latency ms',
      '# TYPE http_p95_latency_ms gauge',
      `http_p95_latency_ms ${snap.p95_latency_ms ?? 0}`,
    ];
    return reply.type('text/plain; version=0.0.4').send(`${lines.join('\n')}\n`);
  });
}
