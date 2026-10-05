import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';
import { coverage, documentedResponses, expectContract } from './helpers/contract.js';
import { createBooking, createHold, localDateInDays, passenger, paymentRef, search } from './helpers/flow.js';

/**
 * Fase 7 — conformidad de RESPUESTAS con el contrato: cada operación se ejercita con los status que
 * documenta y cada body se valida contra el schema del YAML. La última prueba exige que todas las
 * combinaciones operación+status documentadas queden cubiertas (salvo las justificadas).
 */

/** Status documentados que la implementación actual no produce, con su motivo. */
const NOT_PRODUCIBLE: Record<string, string> = {
  'POST /bookings/{bookingId}/cancel 202':
    'La cancelación es síncrona en el GDS simulado: nunca queda CANCELLATION_PENDING.',
};

const ALL_SCOPES = ['flights:read', 'flights:hold', 'flights:book', 'flights:cancel'];

describe('Conformidad de respuestas con el contrato (Fase 7) (e2e)', () => {
  let app: NestExpressApplication;
  let auth: string;

  beforeAll(async () => {
    process.env.ASYNC_PROCESSING_DELAY_MS = '50';
    app = await createTestApp();
    auth = await bearer('cc-user', ALL_SCOPES);
  });

  afterAll(async () => {
    delete process.env.ASYNC_PROCESSING_DELAY_MS;
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const idem = () => randomUUID();

  describe('El validador detecta incumplimientos (control de la propia prueba)', () => {
    const fake = (status: number, body: unknown, contentType = 'application/problem+json') =>
      ({ status, body, text: JSON.stringify(body), headers: { 'content-type': contentType } }) as unknown as request.Response;
    const problem = { type: 'about:blank', title: 'x', status: 404, code: 'VALIDATION_FAILED' };

    it('rechaza un status no documentado', () => {
      expect(() => expectContract('get', '/bookings/{bookingId}', fake(418, problem))).toThrow(/no documenta/);
    });

    it('rechaza propiedades extra en ProblemDetails (additionalProperties: false)', () => {
      expect(() => expectContract('get', '/bookings/{bookingId}', fake(404, { ...problem, requestId: 'abc' }))).toThrow(/no cumple/);
    });

    it('rechaza un `code` fuera del enum y campos requeridos faltantes', () => {
      expect(() => expectContract('get', '/bookings/{bookingId}', fake(404, { ...problem, code: 'NOT_FOUND' }))).toThrow(/no cumple/);
      const { pnr: _pnr, ...withoutPnr } = { bookingId: randomUUID(), pnr: 'ABC123', status: 'CONFIRMED', grandTotal: { currency: 'USD', total: '1.00' }, createdAt: new Date().toISOString() };
      expect(() => expectContract('get', '/bookings/{bookingId}', fake(200, withoutPnr, 'application/json'))).toThrow(/no cumple/);
    });

    it('rechaza formatos inválidos (uuid, date-time)', () => {
      const detail = { bookingId: 'no-uuid', pnr: 'ABC123', status: 'CONFIRMED', grandTotal: { currency: 'USD', total: '1.00' }, createdAt: 'ayer' };
      expect(() => expectContract('get', '/bookings/{bookingId}', fake(200, detail, 'application/json'))).toThrow(/no cumple/);
    });
  });

  describe('Búsqueda y catálogo', () => {
    it('POST /search → 200 y 400', async () => {
      const body = { itineraries: [{ origin: 'UIO', destination: 'BOG', departureDate: localDateInDays(30) }], passengers: {} };
      expectContract('post', '/search', await http().post('/search').set('X-Device-Fingerprint', 'cc').send(body));
      expectContract('post', '/search', await http().post('/search').send(body));
    });

    it('GET /offers/{offerId}/seatmap → 200 y 404', async () => {
      const { offers } = await search(app);
      const segmentId = offers[0].itineraries[0].segments[0].segmentId;
      expectContract('get', '/offers/{offerId}/seatmap', await http().get(`/offers/${offers[0].offerId}/seatmap`).query({ segmentId }));
      expectContract('get', '/offers/{offerId}/seatmap', await http().get('/offers/EA999-20261201/seatmap').query({ segmentId }));
    });
  });

  describe('Hold', () => {
    it('POST /offers/hold → 201, 400, 409 y 422', async () => {
      const { offers } = await search(app);
      const offer = offers[0];
      const selections = offer.itineraries.map((itinerary: { itineraryId: string }) => ({
        itineraryId: itinerary.itineraryId,
        cabinClass: 'ECONOMY',
        fareBrand: 'SEMILLA',
      }));
      /** `null` omite el header Idempotency-Key (obligatorio en el contrato) para provocar el 400. */
      const post = (body: object, key: string | null = idem()) => {
        const call = http().post('/offers/hold').set('Authorization', auth);
        return (key ? call.set('Idempotency-Key', key) : call).send(body);
      };

      expectContract('post', '/offers/hold', await post({ offerId: offer.offerId, itinerarySelections: selections, passengersBreakdown: {} }));
      expectContract('post', '/offers/hold', await post({ offerId: offer.offerId, itinerarySelections: selections, passengersBreakdown: {} }, null));
      expectContract('post', '/offers/hold', await post({ offerId: 'EA999-20261201', itinerarySelections: [], passengersBreakdown: {} }));
      expectContract('post', '/offers/hold', await post({ offerId: offer.offerId, itinerarySelections: [], passengersBreakdown: {} }));
    });

    it('GET y DELETE /offers/hold/{holdId} → 200, 204 y 404', async () => {
      const { holdId } = await createHold(app, 'cc-user');
      expectContract('get', '/offers/hold/{holdId}', await http().get(`/offers/hold/${holdId}`).set('Authorization', auth));
      expectContract('delete', '/offers/hold/{holdId}', await http().delete(`/offers/hold/${holdId}`).set('Authorization', auth));
      expectContract('get', '/offers/hold/{holdId}', await http().get(`/offers/hold/${randomUUID()}`).set('Authorization', auth));
      expectContract('delete', '/offers/hold/{holdId}', await http().delete(`/offers/hold/${randomUUID()}`).set('Authorization', auth));
    });
  });

  describe('Reservas, tickets y listado', () => {
    it('POST /bookings → 201, 202, 400, 409 y 422', async () => {
      const book = (holdId: string, reference = paymentRef()) =>
        http()
          .post('/bookings')
          .set('Authorization', auth)
          .set('Idempotency-Key', idem())
          .send({ holdId, passengers: [passenger('p1')], payment: { paymentReference: reference } });

      const first = await createHold(app, 'cc-user');
      expectContract('post', '/bookings', await book(first.holdId));
      expectContract('post', '/bookings', await book(first.holdId)); // hold ya consumido → 409
      const pending = await createHold(app, 'cc-user');
      expectContract('post', '/bookings', await book(pending.holdId, paymentRef('async')));
      expectContract('post', '/bookings', await book(randomUUID())); // hold inexistente → 422
      expectContract(
        'post',
        '/bookings',
        await http().post('/bookings').set('Authorization', auth).set('Idempotency-Key', idem()).send({ holdId: 'x' }),
      );
    });

    it('GET /bookings, /bookings/{id} y tickets → 200 y 404', async () => {
      const { bookingId, booking } = await createBooking(app, 'cc-user');
      const ticketId = booking.tickets[0].ticketId;

      expectContract('get', '/bookings', await http().get('/bookings').query({ limit: 1 }).set('Authorization', auth));
      expectContract('get', '/bookings/{bookingId}', await http().get(`/bookings/${bookingId}`).set('Authorization', auth));
      expectContract('get', '/bookings/{bookingId}', await http().get(`/bookings/${randomUUID()}`).set('Authorization', auth));
      expectContract('get', '/bookings/{bookingId}/tickets', await http().get(`/bookings/${bookingId}/tickets`).set('Authorization', auth));
      expectContract('get', '/bookings/{bookingId}/tickets', await http().get(`/bookings/${randomUUID()}/tickets`).set('Authorization', auth));
      expectContract(
        'get',
        '/bookings/{bookingId}/tickets/{ticketId}',
        await http().get(`/bookings/${bookingId}/tickets/${ticketId}`).set('Authorization', auth),
      );
      expectContract(
        'get',
        '/bookings/{bookingId}/tickets/{ticketId}',
        await http().get(`/bookings/${bookingId}/tickets/TKT-NOEXISTE`).set('Authorization', auth),
      );
    });
  });

  describe('Posventa', () => {
    it('equipaje → 200, 202 y 409', async () => {
      const { bookingId, booking } = await createBooking(app, 'cc-user', { fareBrand: 'BROTE' });
      const itineraryId = booking.itineraries[0].itineraryId;
      const add = (quantity: number, reference = paymentRef()) =>
        http()
          .post(`/bookings/${bookingId}/baggage`)
          .set('Authorization', auth)
          .set('Idempotency-Key', idem())
          .send({ passengerId: 'p1', itineraryId, quantity, payment: { paymentReference: reference } });

      expectContract('get', '/bookings/{bookingId}/baggage-options', await http().get(`/bookings/${bookingId}/baggage-options`).set('Authorization', auth));
      expectContract('post', '/bookings/{bookingId}/baggage', await add(1));
      expectContract('post', '/bookings/{bookingId}/baggage', await add(1, paymentRef('async')));
      expectContract('post', '/bookings/{bookingId}/baggage', await add(3)); // supera el máximo → 409
    });

    it('cambio de fecha → 200, 202 y 409', async () => {
      const semilla = await createBooking(app, 'cc-user', { fareBrand: 'SEMILLA' });
      expectContract(
        'post',
        '/bookings/{bookingId}/date-change/search',
        await http()
          .post(`/bookings/${semilla.bookingId}/date-change/search`)
          .set('Authorization', auth)
          .send({ changes: [{ itineraryId: semilla.booking.itineraries[0].itineraryId, newDepartureDate: localDateInDays(31) }] }),
      );

      for (const reference of [paymentRef(), paymentRef('async')]) {
        const { bookingId, booking } = await createBooking(app, 'cc-user', { fareBrand: 'BROTE' });
        const offers = await http()
          .post(`/bookings/${bookingId}/date-change/search`)
          .set('Authorization', auth)
          .send({ changes: [{ itineraryId: booking.itineraries[0].itineraryId, newDepartureDate: localDateInDays(31) }] });
        expectContract('post', '/bookings/{bookingId}/date-change/search', offers);

        expectContract(
          'post',
          '/bookings/{bookingId}/date-change',
          await http()
            .post(`/bookings/${bookingId}/date-change`)
            .set('Authorization', auth)
            .set('Idempotency-Key', idem())
            .send({ changeOfferId: offers.body[0].changeOfferId, payment: { paymentReference: reference } }),
        );
      }

      const { bookingId } = await createBooking(app, 'cc-user', { fareBrand: 'BROTE' });
      expectContract(
        'post',
        '/bookings/{bookingId}/date-change',
        await http().post(`/bookings/${bookingId}/date-change`).set('Authorization', auth).set('Idempotency-Key', idem()).send({ changeOfferId: randomUUID() }),
      );
    });

    it('cancelación → 200 y 409', async () => {
      const { bookingId } = await createBooking(app, 'cc-user');
      const quote = await http().get(`/bookings/${bookingId}/cancellation-quote`).set('Authorization', auth);
      expectContract('get', '/bookings/{bookingId}/cancellation-quote', quote);
      const cancel = () =>
        http().post(`/bookings/${bookingId}/cancel`).set('Authorization', auth).set('Idempotency-Key', idem()).send({ quoteId: quote.body.quoteId });
      expectContract('post', '/bookings/{bookingId}/cancel', await cancel());
      expectContract('post', '/bookings/{bookingId}/cancel', await cancel()); // ya cancelada → 409
    });
  });

  describe('Check-in y estado de vuelo', () => {
    it('check-in → 200, 409 y 422; pases → 200 y 404', async () => {
      const tomorrow = await createBooking(app, 'cc-user', { days: 1 });
      const far = await createBooking(app, 'cc-user', { days: 30 });
      const cancelled = await createBooking(app, 'cc-user', { days: 1 });
      const quote = await http().get(`/bookings/${cancelled.bookingId}/cancellation-quote`).set('Authorization', auth);
      await http().post(`/bookings/${cancelled.bookingId}/cancel`).set('Authorization', auth).set('Idempotency-Key', idem()).send({ quoteId: quote.body.quoteId });

      const checkIn = (id: string) => http().post(`/bookings/${id}/check-in`).set('Authorization', auth);
      const passes = (id: string) => http().get(`/bookings/${id}/boarding-passes`).set('Authorization', auth);

      expectContract('get', '/bookings/{bookingId}/boarding-passes', await passes(tomorrow.bookingId)); // 404 antes del check-in
      expectContract('post', '/bookings/{bookingId}/check-in', await checkIn(tomorrow.bookingId));
      expectContract('get', '/bookings/{bookingId}/boarding-passes', await passes(tomorrow.bookingId));
      expectContract('post', '/bookings/{bookingId}/check-in', await checkIn(cancelled.bookingId)); // 409
      expectContract('post', '/bookings/{bookingId}/check-in', await checkIn(far.bookingId)); // 422
    });

    it('GET /flights/{flightNumber}/status → 200 y 404', async () => {
      const date = localDateInDays(1);
      expectContract('get', '/flights/{flightNumber}/status', await http().get('/flights/EA300/status').query({ date }));
      expectContract('get', '/flights/{flightNumber}/status', await http().get('/flights/EA999/status').query({ date }));
    });
  });

  describe('Webhooks', () => {
    it('GET, POST y DELETE /webhooks → 200, 201 y 204', async () => {
      const partner = await bearer('cc-partner', ['flights:webhooks']);
      const created = await http()
        .post('/webhooks')
        .set('Authorization', partner)
        .send({ url: 'https://partner.example.com/hooks', events: ['booking.confirmed'], secret: 'whsec_cc' });
      expectContract('post', '/webhooks', created);
      expectContract('get', '/webhooks', await http().get('/webhooks').set('Authorization', partner));
      expectContract('delete', '/webhooks/{id}', await http().delete(`/webhooks/${created.body.id}`).set('Authorization', partner));
    });
  });

  describe('Expiraciones (reloj adelantado)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    async function at(time: number) {
      vi.setSystemTime(time);
      auth = await bearer('cc-user', ALL_SCOPES);
    }

    it('POST /bookings con hold vencido → 410; el hold queda EXPIRED', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const start = Date.now();
      const { holdId } = await createHold(app, 'cc-user');
      await at(start + 16 * 60_000);

      const response = await http()
        .post('/bookings')
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ holdId, passengers: [passenger('p1')], payment: { paymentReference: paymentRef() } });
      expectContract('post', '/bookings', response);
      expect(response.status).toBe(410);

      const status = await http().get(`/offers/hold/${holdId}`).set('Authorization', auth);
      expectContract('get', '/offers/hold/{holdId}', status);
      expect(status.body.status).toBe('EXPIRED');
    });

    it('oferta de cambio vencida → 410 CHANGE_OFFER_EXPIRED', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const start = Date.now();
      const { bookingId, booking } = await createBooking(app, 'cc-user', { fareBrand: 'BROTE' });
      const offers = await http()
        .post(`/bookings/${bookingId}/date-change/search`)
        .set('Authorization', auth)
        .send({ changes: [{ itineraryId: booking.itineraries[0].itineraryId, newDepartureDate: localDateInDays(31) }] });
      await at(start + 16 * 60_000);

      const response = await http()
        .post(`/bookings/${bookingId}/date-change`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ changeOfferId: offers.body[0].changeOfferId, payment: { paymentReference: paymentRef() } });
      expectContract('post', '/bookings/{bookingId}/date-change', response);
      expect(response.body.code).toBe('CHANGE_OFFER_EXPIRED');
    });

    it('cotización de cancelación vencida → 409 QUOTE_EXPIRED (HALL-18)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const start = Date.now();
      const { bookingId } = await createBooking(app, 'cc-user');
      const quote = await http().get(`/bookings/${bookingId}/cancellation-quote`).set('Authorization', auth);
      await at(start + 16 * 60_000);

      const response = await http()
        .post(`/bookings/${bookingId}/cancel`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ quoteId: quote.body.quoteId });
      expectContract('post', '/bookings/{bookingId}/cancel', response);
      expect(response.body.code).toBe('QUOTE_EXPIRED');
    });

    it('check-in a menos de 60 min de la salida → 422 CUTOFF_PASSED', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { bookingId, booking } = await createBooking(app, 'cc-user', { days: 1 });
      const departure = Date.parse(booking.itineraries[0].segments[0].departure.at);
      await at(departure - 30 * 60_000);

      const response = await http().post(`/bookings/${bookingId}/check-in`).set('Authorization', auth);
      expectContract('post', '/bookings/{bookingId}/check-in', response);
      expect(response.body.code).toBe('CUTOFF_PASSED');
    });
  });

  describe('Rate limiting (al final: deja contadores agotados)', () => {
    it('POST /search y GET seatmap → 429 con el ProblemDetails del contrato', async () => {
      const { offers } = await search(app);
      const segmentId = offers[0].itineraries[0].segments[0].segmentId;
      process.env.RATE_LIMIT_SEARCH_LIMIT = '1';
      process.env.RATE_LIMIT_SEATMAP_LIMIT = '1';
      try {
        const body = { itineraries: [{ origin: 'UIO', destination: 'BOG', departureDate: localDateInDays(30) }], passengers: {} };
        await http().post('/search').set('X-Device-Fingerprint', 'cc').send(body);
        const limited = await http().post('/search').set('X-Device-Fingerprint', 'cc').send(body);
        expectContract('post', '/search', limited);
        expect(limited.status).toBe(429);

        await http().get(`/offers/${offers[0].offerId}/seatmap`).query({ segmentId });
        const seatmap = await http().get(`/offers/${offers[0].offerId}/seatmap`).query({ segmentId });
        expectContract('get', '/offers/{offerId}/seatmap', seatmap);
        expect(seatmap.status).toBe(429);
      } finally {
        delete process.env.RATE_LIMIT_SEARCH_LIMIT;
        delete process.env.RATE_LIMIT_SEATMAP_LIMIT;
      }
    });
  });

  describe('Cobertura', () => {
    it('cubre todas las respuestas documentadas del contrato, salvo las justificadas', () => {
      const uncovered = documentedResponses().filter((response) => !coverage.has(response));
      expect(uncovered.sort(), `Sin cubrir: ${uncovered.join(' | ')}`).toEqual(Object.keys(NOT_PRODUCIBLE).sort());
    });
  });
});
