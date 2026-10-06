import { Injectable } from '@nestjs/common';

/** Una petición ya respondida. Solo datos no sensibles: nunca headers, bodies, tokens ni query strings. */
export interface HttpRequestSample {
  method: string;
  /** Patrón de la ruta (`/bookings/:bookingId`), no la URL real: no expone ids ni datos del cliente. */
  route: string;
  status: number;
  durationMs: number;
  requestId?: string;
  at: Date;
}

type StatusClass = '2xx' | '3xx' | '4xx' | '5xx';
type StatusClassCounts = Record<StatusClass, number>;

interface RouteAccumulator {
  method: string;
  route: string;
  count: number;
  statusClasses: StatusClassCounts;
  totalMs: number;
  maxMs: number;
  /** Últimas duraciones, para el percentil 95. */
  recent: number[];
}

export interface LatencyStats {
  averageMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface ObservabilitySnapshot {
  generatedAt: string;
  startedAt: string;
  uptimeSeconds: number;
  process: { nodeVersion: string; rssMb: number; heapUsedMb: number; heapTotalMb: number };
  totals: { requests: number; statusClasses: StatusClassCounts; latency: LatencyStats };
  routes: { method: string; route: string; count: number; statusClasses: StatusClassCounts; latency: LatencyStats }[];
  recentErrors: { at: string; method: string; route: string; status: number; durationMs: number; requestId?: string }[];
}

const RECENT_DURATIONS_PER_ROUTE = 200;
const RECENT_ERRORS = 50;
/** Ruta usada cuando la petición se respondió antes de llegar a un controller (404, CORS, body inválido). */
export const UNMATCHED_ROUTE = '(sin ruta)';

/**
 * Métricas HTTP en memoria para el panel de observabilidad (solo administradores). Inspirado en el panel de
 * Ejemplo 1, pero del lado del servidor: peticiones por ruta y status, latencias y errores recientes con su
 * `X-Request-Id` para buscarlos en el log. Se reinicia con la API y es por instancia; en la nube se
 * reemplazaría por un sistema de métricas (Prometheus, OpenTelemetry) sin cambiar el endpoint.
 */
@Injectable()
export class HttpMetricsStore {
  private readonly startedAt = new Date();
  private readonly routes = new Map<string, RouteAccumulator>();
  private readonly errors: HttpRequestSample[] = [];

  record(sample: HttpRequestSample): void {
    const key = `${sample.method} ${sample.route}`;
    let accumulator = this.routes.get(key);
    if (!accumulator) {
      accumulator = { method: sample.method, route: sample.route, count: 0, statusClasses: emptyClasses(), totalMs: 0, maxMs: 0, recent: [] };
      this.routes.set(key, accumulator);
    }
    accumulator.count += 1;
    accumulator.statusClasses[statusClass(sample.status)] += 1;
    accumulator.totalMs += sample.durationMs;
    accumulator.maxMs = Math.max(accumulator.maxMs, sample.durationMs);
    accumulator.recent.push(sample.durationMs);
    if (accumulator.recent.length > RECENT_DURATIONS_PER_ROUTE) accumulator.recent.shift();

    if (sample.status >= 400) {
      this.errors.push(sample);
      if (this.errors.length > RECENT_ERRORS) this.errors.shift();
    }
  }

  snapshot(): ObservabilitySnapshot {
    const routes = [...this.routes.values()];
    const memory = process.memoryUsage();
    const totals = routes.reduce(
      (acc, route) => {
        acc.requests += route.count;
        acc.totalMs += route.totalMs;
        acc.maxMs = Math.max(acc.maxMs, route.maxMs);
        acc.recent.push(...route.recent);
        for (const key of Object.keys(acc.statusClasses) as StatusClass[]) acc.statusClasses[key] += route.statusClasses[key];
        return acc;
      },
      { requests: 0, totalMs: 0, maxMs: 0, recent: [] as number[], statusClasses: emptyClasses() },
    );

    return {
      generatedAt: new Date().toISOString(),
      startedAt: this.startedAt.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      process: {
        nodeVersion: process.version,
        rssMb: megabytes(memory.rss),
        heapUsedMb: megabytes(memory.heapUsed),
        heapTotalMb: megabytes(memory.heapTotal),
      },
      totals: {
        requests: totals.requests,
        statusClasses: totals.statusClasses,
        latency: latency(totals.totalMs, totals.requests, totals.maxMs, totals.recent),
      },
      routes: routes
        .sort((a, b) => b.count - a.count)
        .map((route) => ({
          method: route.method,
          route: route.route,
          count: route.count,
          statusClasses: { ...route.statusClasses },
          latency: latency(route.totalMs, route.count, route.maxMs, route.recent),
        })),
      recentErrors: [...this.errors].reverse().map((sample) => ({
        at: sample.at.toISOString(),
        method: sample.method,
        route: sample.route,
        status: sample.status,
        durationMs: sample.durationMs,
        ...(sample.requestId ? { requestId: sample.requestId } : {}),
      })),
    };
  }
}

function emptyClasses(): StatusClassCounts {
  return { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
}

function statusClass(status: number): StatusClass {
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  return '2xx';
}

function latency(totalMs: number, count: number, maxMs: number, recent: number[]): LatencyStats {
  const sorted = [...recent].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]! : 0;
  return { averageMs: count ? round(totalMs / count) : 0, p95Ms: round(p95), maxMs: round(maxMs) };
}

const round = (value: number) => Math.round(value * 10) / 10;
const megabytes = (bytes: number) => Math.round((bytes / 1_048_576) * 10) / 10;
