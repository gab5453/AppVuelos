import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { setupSwagger } from '../src/docs/swagger.setup.js';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';
import { createBooking } from './helpers/flow.js';

const FRONTEND_ORIGIN = 'http://localhost:5173';
const validSearch = {
  itineraries: [{ origin: 'UIO', destination: 'BOG', departureDate: '2026-12-01' }],
  passengers: { adults: 1 },
};

function validBooking() {
  return {
    holdId: randomUUID(),
    passengers: [
      {
        passengerId: 'p1',
        passengerType: 'ADULT',
        firstName: 'Jane',
        lastName: 'Doe',
        documentType: 'PASSPORT',
        documentNumber: 'X123456',
        nationality: 'EC',
        birthDate: '1990-01-01',
        gender: 'F',
        contact: { email: 'jane@example.com', phone: '+593000000000' },
      },
    ],
    payment: { paymentReference: 'pay_ref_123' },
  };
}

describe('Seguridad HTTP (Fase 3) (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp((instance) =>
      setupSwagger(instance, { devOverlay: true, localServerUrl: 'http://localhost:3000' }),
    );
  });

  afterEach(async () => {
    await app.close();
  });

  describe('cabeceras', () => {
    it('la API responde con cabeceras de seguridad y una CSP que no permite cargar nada', async () => {
      const response = await request(app.getHttpServer()).get('/flights/AA1/status').query({ date: '2026-01-01' });

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
      expect(response.headers).not.toHaveProperty('x-powered-by');
      // HSTS solo en producción.
      expect(response.headers).not.toHaveProperty('strict-transport-security');
    });

    it('Swagger UI recibe una CSP que le permite cargar sus recursos', async () => {
      const response = await request(app.getHttpServer()).get('/docs/').expect(200);
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toContain('upgrade-insecure-requests');
    });
  });

  describe('CORS', () => {
    it('el preflight del frontend permitido incluye los headers del contrato', async () => {
      const response = await request(app.getHttpServer())
        .options('/bookings')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type,idempotency-key')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(FRONTEND_ORIGIN);
      expect(response.headers['access-control-allow-headers']).toContain('Idempotency-Key');
      expect(response.headers['access-control-allow-headers']).toContain('X-Device-Fingerprint');
      expect(response.headers).not.toHaveProperty('access-control-allow-credentials');
    });

    it('expone Retry-After al navegador', async () => {
      const response = await request(app.getHttpServer())
        .get('/flights/AA1/status')
        .query({ date: '2026-01-01' })
        .set('Origin', FRONTEND_ORIGIN);
      expect(response.headers['access-control-expose-headers']).toContain('Retry-After');
    });

    it('un origen no permitido no recibe Access-Control-Allow-Origin', async () => {
      const response = await request(app.getHttpServer())
        .options('/bookings')
        .set('Origin', 'https://evil.example.com')
        .set('Access-Control-Request-Method', 'POST');
      expect(response.headers).not.toHaveProperty('access-control-allow-origin');
    });
  });

  describe('rate limiting (429 del contrato)', () => {
    const previous = process.env.RATE_LIMIT_SEARCH_LIMIT;

    beforeEach(() => {
      process.env.RATE_LIMIT_SEARCH_LIMIT = '2';
    });

    afterEach(() => {
      if (previous === undefined) delete process.env.RATE_LIMIT_SEARCH_LIMIT;
      else process.env.RATE_LIMIT_SEARCH_LIMIT = previous;
    });

    it('POST /search responde 429 RATE_LIMIT_EXCEEDED con Retry-After al superar el límite', async () => {
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer()).post('/search').set('X-Device-Fingerprint', 'd1').send(validSearch).expect(200);
      }

      const response = await request(app.getHttpServer())
        .post('/search')
        .set('X-Device-Fingerprint', 'd1')
        .send(validSearch)
        .expect(429);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 429, code: 'RATE_LIMIT_EXCEEDED' });
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('el límite de /search no afecta a otros endpoints', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer()).post('/search').set('X-Device-Fingerprint', 'd1').send(validSearch);
      }
      await request(app.getHttpServer()).get('/flights/AA1/status').query({ date: '2026-01-01' }).expect(404);
    });
  });

  describe('body y Content-Type', () => {
    it('rechaza un body mayor al límite con 400 ProblemDetails', async () => {
      const response = await request(app.getHttpServer())
        .post('/search')
        .set('X-Device-Fingerprint', 'd1')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ ...validSearch, padding: 'x'.repeat(150_000) }))
        .expect(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body.invalidParams).toEqual([{ name: 'body', reason: 'payload too large' }]);
    });

    it('rechaza JSON malformado con 400 ProblemDetails', async () => {
      const response = await request(app.getHttpServer())
        .post('/search')
        .set('X-Device-Fingerprint', 'd1')
        .set('Content-Type', 'application/json')
        .send('{"itineraries": [')
        .expect(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED', invalidParams: [{ name: 'body', reason: 'malformed JSON' }] });
    });

    it('rechaza bodies que no son application/json', async () => {
      const response = await request(app.getHttpServer())
        .post('/search')
        .set('X-Device-Fingerprint', 'd1')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('itineraries=x')
        .expect(400);
      expect(response.body.invalidParams).toEqual([{ name: 'Content-Type', reason: 'must be application/json' }]);
    });
  });

  describe('saneamiento de entrada', () => {
    it('rechaza claves __proto__ anidadas (prototype pollution)', async () => {
      const raw = JSON.stringify(validBooking()).replace('"contact":{', '"contact":{"__proto__":{"isAdmin":true},');
      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', await bearer('owner-a', ['flights:book']))
        .set('Idempotency-Key', randomUUID())
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(400);
      expect(response.body.invalidParams).toEqual([
        { name: 'passengers[0].contact.__proto__', reason: 'property name not allowed' },
      ]);
    });

    it('rechaza caracteres de control en strings', async () => {
      const booking = validBooking();
      booking.passengers[0]!.firstName = 'Ja\u0000ne';
      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', await bearer('owner-a', ['flights:book']))
        .set('Idempotency-Key', randomUUID())
        .send(booking)
        .expect(400);
      expect(response.body.invalidParams).toEqual([
        { name: 'passengers[0].firstName', reason: 'contains control characters' },
      ]);
    });

    it('recorta espacios al inicio y al final', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Authorization', await bearer('partner-a', ['flights:webhooks']))
        .send({ url: 'https://partner.example.com/hooks', events: ['booking.confirmed'], secret: '  whsec_123  ' })
        .expect(201);
      expect(response.body.secret).toBe('whsec_123');
    });
  });

  describe('PaymentReference (additionalProperties: false)', () => {
    it('POST /bookings rechaza propiedades extra dentro de payment', async () => {
      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', await bearer('owner-a', ['flights:book']))
        .set('Idempotency-Key', randomUUID())
        .send({ ...validBooking(), payment: { paymentReference: 'pay_1', cardNumber: '4111111111111111' } })
        .expect(400);
      expect(response.body.invalidParams).toEqual([{ name: 'payment.cardNumber', reason: 'property not allowed' }]);
    });

    it('POST /bookings/{id}/baggage rechaza propiedades extra dentro de payment', async () => {
      const { bookingId, booking } = await createBooking(app, 'owner-a');

      const response = await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/baggage`)
        .set('Authorization', await bearer('owner-a', ['flights:book']))
        .set('Idempotency-Key', randomUUID())
        .send({
          passengerId: 'p1',
          itineraryId: booking.itineraries[0].itineraryId,
          quantity: 1,
          payment: { paymentReference: 'pay_2xyz', cvv: '123' },
        })
        .expect(400);
      expect(response.body.invalidParams).toEqual([{ name: 'payment.cvv', reason: 'property not allowed' }]);
    });
  });
});
