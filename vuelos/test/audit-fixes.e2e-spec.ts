import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';
import { createBooking as createRealBooking, paymentRef, search } from './helpers/flow.js';

function validPassenger() {
  return {
    passengerId: 'p1',
    passengerType: 'ADULT',
    firstName: 'Jane',
    lastName: 'Doe',
    documentType: 'PASSPORT',
    documentNumber: 'X123456',
    nationality: 'US',
    birthDate: '1990-01-01',
    gender: 'F',
    contact: { email: 'jane@example.com', phone: '+10000000000' },
  };
}

function validBookingRequest() {
  return {
    holdId: randomUUID(),
    passengers: [validPassenger()],
    payment: { paymentReference: 'pay_ref_123' },
  };
}

describe('Auditoría (correcciones AUD-002..013) (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createBooking(sub: string) {
    return (await createRealBooking(app, sub)).bookingId;
  }

  describe('AUD-002/004/011 — ownership de reservas', () => {
    it('un usuario no puede leer el detalle de una reserva de otro usuario (404, no 403)', async () => {
      const bookingId = await createBooking('owner-a');

      await request(app.getHttpServer())
        .get(`/bookings/${bookingId}`)
        .set('Authorization', await bearer('owner-b', ['flights:read']))
        .expect(404);

      await request(app.getHttpServer())
        .get(`/bookings/${bookingId}`)
        .set('Authorization', await bearer('owner-a', ['flights:read']))
        .expect(200);
    });

    it('un usuario no puede cancelar la reserva de otro usuario (404)', async () => {
      const bookingId = await createBooking('owner-a');

      await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/cancel`)
        .set('Authorization', await bearer('owner-b', ['flights:cancel']))
        .set('Idempotency-Key', randomUUID())
        .send({ quoteId: randomUUID() })
        .expect(404);
    });

    it('bookingId con formato inválido responde 400 en vez de propagarse al repositorio', async () => {
      await request(app.getHttpServer())
        .get('/bookings/not-a-uuid')
        .set('Authorization', await bearer('owner-a', ['flights:read']))
        .expect(400);
    });
  });

  describe('AUD-003 — cancelación usa CancelBookingRequestDto y respeta quoteId', () => {
    it('cancela con éxito (200) y una segunda cancelación responde 409 ALREADY_CANCELLED', async () => {
      const bookingId = await createBooking('owner-a');

      const quote = await request(app.getHttpServer())
        .get(`/bookings/${bookingId}/cancellation-quote`)
        .set('Authorization', await bearer('owner-a', ['flights:read']))
        .expect(200);

      await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/cancel`)
        .set('Authorization', await bearer('owner-a', ['flights:cancel']))
        .set('Idempotency-Key', randomUUID())
        .send({ quoteId: quote.body.quoteId })
        .expect(200);

      const detail = await request(app.getHttpServer())
        .get(`/bookings/${bookingId}`)
        .set('Authorization', await bearer('owner-a', ['flights:read']))
        .expect(200);
      expect(detail.body.status).toBe('CANCELLED');

      const secondAttempt = await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/cancel`)
        .set('Authorization', await bearer('owner-a', ['flights:cancel']))
        .set('Idempotency-Key', randomUUID())
        .send({ quoteId: quote.body.quoteId })
        .expect(409);
      expect(secondAttempt.body.code).toBe('ALREADY_CANCELLED');
    });

    it('rechaza el body si falta quoteId (requerido por el contrato)', async () => {
      const bookingId = await createBooking('owner-a');

      const response = await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/cancel`)
        .set('Authorization', await bearer('owner-a', ['flights:cancel']))
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('AUD-005 — idempotencia atómica', () => {
    async function holdRequest(offerIndex = 0) {
      const { offers } = await search(app);
      const offer = offers[offerIndex];
      return {
        offerId: offer.offerId,
        itinerarySelections: offer.itineraries.map((itinerary: { itineraryId: string }) => ({
          itineraryId: itinerary.itineraryId,
          cabinClass: 'ECONOMY',
          fareBrand: 'SEMILLA',
        })),
        passengersBreakdown: {},
      };
    }

    it('reusar la misma Idempotency-Key con un body distinto responde 409', async () => {
      const key = randomUUID();
      const [firstBody, secondBody] = [await holdRequest(0), await holdRequest(1)];

      await request(app.getHttpServer())
        .post('/offers/hold')
        .set('Authorization', await bearer('user-a', ['flights:hold']))
        .set('Idempotency-Key', key)
        .send(firstBody)
        .expect(201);

      const conflict = await request(app.getHttpServer())
        .post('/offers/hold')
        .set('Authorization', await bearer('user-a', ['flights:hold']))
        .set('Idempotency-Key', key)
        .send(secondBody)
        .expect(409);
      expect(conflict.body.status).toBe(409);
    });

    it('la misma Idempotency-Key de otro usuario no colisiona (REV-07)', async () => {
      const key = randomUUID();
      const body = await holdRequest(0);
      for (const user of ['user-a', 'user-b']) {
        await request(app.getHttpServer())
          .post('/offers/hold')
          .set('Authorization', await bearer(user, ['flights:hold']))
          .set('Idempotency-Key', key)
          .send(body)
          .expect(201);
      }
    });

    it('reusar la misma Idempotency-Key con el mismo body devuelve la respuesta cacheada', async () => {
      const key = randomUUID();
      const body = await holdRequest(0);

      const first = await request(app.getHttpServer())
        .post('/offers/hold')
        .set('Authorization', await bearer('user-a', ['flights:hold']))
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/offers/hold')
        .set('Authorization', await bearer('user-a', ['flights:hold']))
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      expect(second.body).toEqual(first.body);
    });
  });

  describe('AUD-006 — status code de agregar equipaje', () => {
    it('POST /bookings/{bookingId}/baggage responde 200 (no 201)', async () => {
      const { bookingId, booking } = await createRealBooking(app, 'owner-a');

      await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/baggage`)
        .set('Authorization', await bearer('owner-a', ['flights:book']))
        .set('Idempotency-Key', randomUUID())
        .send({
          passengerId: 'p1',
          itineraryId: booking.itineraries[0].itineraryId,
          quantity: 1,
          payment: { paymentReference: paymentRef() },
        })
        .expect(200);
    });
  });

  describe('AUD-007 — X-Device-Fingerprint obligatorio en /search', () => {
    const validSearchBody = {
      itineraries: [{ origin: 'MIA', destination: 'BOG', departureDate: '2026-01-01' }],
      passengers: { adults: 1 },
    };

    it('responde 400 si falta el header aunque el body sea válido', async () => {
      const response = await request(app.getHttpServer())
        .post('/search')
        .send(validSearchBody)
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    });

    it('acepta la búsqueda cuando el header está presente', async () => {
      await request(app.getHttpServer())
        .post('/search')
        .set('X-Device-Fingerprint', 'device-123')
        .send(validSearchBody)
        .expect(200);
    });
  });

  describe('AUD-013 — additionalProperties: false', () => {
    it('POST /search rechaza propiedades no declaradas por el contrato', async () => {
      const response = await request(app.getHttpServer())
        .post('/search')
        .set('X-Device-Fingerprint', 'device-123')
        .send({
          itineraries: [{ origin: 'MIA', destination: 'BOG', departureDate: '2026-01-01' }],
          passengers: { adults: 1 },
          unexpectedField: 'should be rejected',
        })
        .expect(400);
      expect(response.body.invalidParams).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'unexpectedField' })]),
      );
    });

    it('POST /bookings rechaza propiedades no declaradas por el contrato', async () => {
      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', await bearer('owner-a', ['flights:book']))
        .set('Idempotency-Key', randomUUID())
        .send({ ...validBookingRequest(), unexpectedField: 'nope' })
        .expect(400);
      expect(response.body.invalidParams).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'unexpectedField' })]),
      );
    });
  });

  describe('AUD-010 — parámetros UUID', () => {
    it('GET /offers/hold/{holdId} con id inválido responde 400', async () => {
      await request(app.getHttpServer())
        .get('/offers/hold/not-a-uuid')
        .set('Authorization', await bearer('user-a', ['flights:read']))
        .expect(400);
    });
  });
});
