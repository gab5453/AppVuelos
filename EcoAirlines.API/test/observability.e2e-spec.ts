import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('Excepciones y trazabilidad (Fase 4) (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('X-Request-Id', () => {
    it('se genera en respuestas exitosas y de error', async () => {
      const ok = await request(app.getHttpServer())
        .get('/bookings')
        .set('Authorization', await bearer('user-a', ['flights:read']))
        .expect(200);
      const error = await request(app.getHttpServer()).get('/bookings').expect(401);

      expect(ok.headers['x-request-id']).toMatch(UUID);
      expect(error.headers['x-request-id']).toMatch(UUID);
      expect(ok.headers['x-request-id']).not.toBe(error.headers['x-request-id']);
    });

    it('respeta el X-Request-Id del cliente si es un UUID', async () => {
      const id = randomUUID();
      const response = await request(app.getHttpServer()).get('/bookings').set('X-Request-Id', id);
      expect(response.headers['x-request-id']).toBe(id);
    });

    it('se incluye también en errores producidos antes de llegar a Nest (JSON malformado)', async () => {
      const response = await request(app.getHttpServer())
        .post('/search')
        .set('Content-Type', 'application/json')
        .send('{')
        .expect(400);
      expect(response.headers['x-request-id']).toMatch(UUID);
    });
  });

  describe('respuestas 404 en formato ProblemDetails', () => {
    it('una ruta inexistente responde 404 application/problem+json', async () => {
      const response = await request(app.getHttpServer()).get('/no-existe').expect(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 404, title: 'Not Found', code: 'VALIDATION_FAILED' });
    });

    it('un hold inexistente responde un 404 con título del dominio', async () => {
      const response = await request(app.getHttpServer())
        .get(`/offers/hold/${randomUUID()}`)
        .set('Authorization', await bearer('user-a', ['flights:read']))
        .expect(404);
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Hold no encontrado.',
        status: 404,
        code: 'VALIDATION_FAILED',
      });
    });

    it('el estado de un vuelo inexistente usa el código FLIGHT_STATUS_NOT_AVAILABLE del contrato', async () => {
      const response = await request(app.getHttpServer())
        .get('/flights/XX999/status')
        .query({ date: '2026-01-01' })
        .expect(404);
      expect(response.body.code).toBe('FLIGHT_STATUS_NOT_AVAILABLE');
    });
  });
});
