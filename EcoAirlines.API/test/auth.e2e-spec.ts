import type { NestExpressApplication } from '@nestjs/platform-express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { loadAuthConfig } from '../src/auth/auth.config.js';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';
import { createHold as createRealHold } from './helpers/flow.js';

describe('Autenticación JWT y ownership (Fase 2) (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('verificación del token', () => {
    it('acepta un JWT firmado válido con el scope requerido', async () => {
      await request(app.getHttpServer())
        .get('/bookings')
        .set('Authorization', await bearer('user-a', ['flights:read']))
        .expect(200);
    });

    it('rechaza el antiguo token mock `sub:scopes` con 401 ProblemDetails', async () => {
      const response = await request(app.getHttpServer())
        .get('/bookings')
        .set('Authorization', 'Bearer user-a:flights:read')
        .expect(401);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body.status).toBe(401);
    });

    it('rechaza un JWT firmado con un secreto distinto', async () => {
      const config = loadAuthConfig();
      const forged = await new SignJWT({ scope: 'flights:read' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('user-a')
        .setIssuer(config.issuer)
        .setAudience(config.audience)
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode('attacker-controlled-secret-0123456789'));

      await request(app.getHttpServer())
        .get('/bookings')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('un token válido sin el scope requerido responde 403', async () => {
      await request(app.getHttpServer())
        .get('/bookings')
        .set('Authorization', await bearer('user-a', ['flights:hold']))
        .expect(403);
    });
  });

  describe('ownership de holds', () => {
    async function createHold(sub: string): Promise<string> {
      return (await createRealHold(app, sub)).holdId;
    }

    it('el dueño consulta su hold; otro usuario recibe 404', async () => {
      const holdId = await createHold('owner-a');

      const own = await request(app.getHttpServer())
        .get(`/offers/hold/${holdId}`)
        .set('Authorization', await bearer('owner-a', ['flights:read']))
        .expect(200);
      expect(own.body).not.toHaveProperty('ownerId');

      await request(app.getHttpServer())
        .get(`/offers/hold/${holdId}`)
        .set('Authorization', await bearer('owner-b', ['flights:read']))
        .expect(404);
    });

    it('otro usuario no puede liberar el hold (404) y el hold sigue HELD', async () => {
      const holdId = await createHold('owner-a');

      await request(app.getHttpServer())
        .delete(`/offers/hold/${holdId}`)
        .set('Authorization', await bearer('owner-b', ['flights:hold']))
        .expect(404);

      const status = await request(app.getHttpServer())
        .get(`/offers/hold/${holdId}`)
        .set('Authorization', await bearer('owner-a', ['flights:read']))
        .expect(200);
      expect(status.body.status).toBe('HELD');

      await request(app.getHttpServer())
        .delete(`/offers/hold/${holdId}`)
        .set('Authorization', await bearer('owner-a', ['flights:hold']))
        .expect(204);
    });
  });

  describe('ownership de webhooks', () => {
    const subscription = {
      url: 'https://partner-a.example.com/hooks',
      events: ['booking.confirmed'],
      secret: 'whsec_partner_a',
    };

    it('cada cliente solo lista sus suscripciones y la respuesta no expone ownerId', async () => {
      const created = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Authorization', await bearer('partner-a', ['flights:webhooks']))
        .send(subscription)
        .expect(201);
      expect(created.body).not.toHaveProperty('ownerId');

      const ownList = await request(app.getHttpServer())
        .get('/webhooks')
        .set('Authorization', await bearer('partner-a', ['flights:webhooks']))
        .expect(200);
      expect(ownList.body).toEqual([created.body]);

      const otherList = await request(app.getHttpServer())
        .get('/webhooks')
        .set('Authorization', await bearer('partner-b', ['flights:webhooks']))
        .expect(200);
      expect(otherList.body).toEqual([]);
    });

    it('otro cliente no puede eliminar la suscripción (204 sin efecto)', async () => {
      const created = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Authorization', await bearer('partner-a', ['flights:webhooks']))
        .send(subscription)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/webhooks/${created.body.id}`)
        .set('Authorization', await bearer('partner-b', ['flights:webhooks']))
        .expect(204);

      const ownList = await request(app.getHttpServer())
        .get('/webhooks')
        .set('Authorization', await bearer('partner-a', ['flights:webhooks']))
        .expect(200);
      expect(ownList.body).toHaveLength(1);

      await request(app.getHttpServer())
        .delete(`/webhooks/${created.body.id}`)
        .set('Authorization', await bearer('partner-a', ['flights:webhooks']))
        .expect(204);

      const afterDelete = await request(app.getHttpServer())
        .get('/webhooks')
        .set('Authorization', await bearer('partner-a', ['flights:webhooks']))
        .expect(200);
      expect(afterDelete.body).toEqual([]);
    });
  });
});
