import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';

describe('Vuelos API (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('GET /flights/:flightNumber/status (público) responde ProblemDetails 404 para un vuelo inexistente', async () => {
    const response = await request(app.getHttpServer())
      .get('/flights/AA123/status')
      .query({ date: '2026-01-01' })
      .expect(404);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toHaveProperty('code');
    expect(response.body).toHaveProperty('status', 404);
  });

  it('POST /search (público) exige X-Device-Fingerprint y valida el body', async () => {
    const response = await request(app.getHttpServer())
      .post('/search')
      .send({})
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('POST /offers/hold (protegido) rechaza peticiones sin Authorization', async () => {
    await request(app.getHttpServer())
      .post('/offers/hold')
      .send({})
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
