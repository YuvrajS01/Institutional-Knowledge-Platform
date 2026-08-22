export interface MetricsSnapshot {
  uptime_seconds: number;
  requests_total: number;
  errors_total: number;
  responses_by_status: Record<string, number>;
  avg_latency_ms: number;
  p95_latency_ms: number | null;
  timestamp: string;
}

class Metrics {
  private requestsTotal = 0;
  private errorsTotal = 0;
  private latencies: number[] = [];
  private byStatus: Record<string, number> = {};
  private start = Date.now();

  record(statusCode: number, latencyMs: number): void {
    this.requestsTotal++;
    const key = String(statusCode);
    this.byStatus[key] = (this.byStatus[key] ?? 0) + 1;
    if (statusCode >= 500) this.errorsTotal++;
    // Keep last 1000 latencies for p95/avg
    this.latencies.push(latencyMs);
    if (this.latencies.length > 1000) this.latencies.shift();
  }

  snapshot(): MetricsSnapshot {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const p95Idx = Math.ceil(sorted.length * 0.95) - 1;
    const p95 = sorted.length > 0 ? (sorted[p95Idx] ?? sorted[sorted.length - 1] ?? null) : null;
    return {
      uptime_seconds: Math.round((Date.now() - this.start) / 1000),
      requests_total: this.requestsTotal,
      errors_total: this.errorsTotal,
      responses_by_status: { ...this.byStatus },
      avg_latency_ms: Math.round(avg * 100) / 100,
      p95_latency_ms: p95 !== null ? Math.round(p95 * 100) / 100 : null,
      timestamp: new Date().toISOString(),
    };
  }

  reset(): void {
    this.requestsTotal = 0;
    this.errorsTotal = 0;
    this.latencies = [];
    this.byStatus = {};
    this.start = Date.now();
  }
}

export const metrics = new Metrics();
