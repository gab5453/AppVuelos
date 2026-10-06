import { HttpMetricsStore } from './http-metrics.store.js';

const sample = (route: string, status: number, durationMs: number, requestId?: string) => ({
  method: 'GET',
  route,
  status,
  durationMs,
  requestId,
  at: new Date('2026-10-05T10:00:00Z'),
});

describe('HttpMetricsStore', () => {
  it('agrupa por método y patrón de ruta, con clases de status y latencias', () => {
    const store = new HttpMetricsStore();
    for (let ms = 1; ms <= 100; ms++) store.record(sample('/bookings/:bookingId', ms === 100 ? 500 : 200, ms));
    store.record(sample('/search', 429, 5));

    const snapshot = store.snapshot();
    const bookings = snapshot.routes.find((route) => route.route === '/bookings/:bookingId')!;
    expect(bookings.count).toBe(100);
    expect(bookings.statusClasses).toEqual({ '2xx': 99, '3xx': 0, '4xx': 0, '5xx': 1 });
    expect(bookings.latency).toEqual({ averageMs: 50.5, p95Ms: 95, maxMs: 100 });
    expect(snapshot.totals.requests).toBe(101);
    expect(snapshot.totals.statusClasses['4xx']).toBe(1);
  });

  it('lista los errores más recientes primero, con su requestId, y conserva solo los últimos 50', () => {
    const store = new HttpMetricsStore();
    for (let index = 0; index < 60; index++) store.record(sample('/x', 404, 1, `req-${index}`));

    const { recentErrors } = store.snapshot();
    expect(recentErrors).toHaveLength(50);
    expect(recentErrors[0]).toMatchObject({ status: 404, requestId: 'req-59' });
    expect(recentErrors.at(-1)!.requestId).toBe('req-10');
  });

  it('no registra como error las respuestas exitosas', () => {
    const store = new HttpMetricsStore();
    store.record(sample('/ok', 204, 1));
    expect(store.snapshot().recentErrors).toEqual([]);
  });
});
