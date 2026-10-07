import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';
import { createHold, passenger, paymentRef, search } from './helpers/flow.js';

/**
 * Persistencia en PostgreSQL (criterio 5). Solo corre con `TEST_DATABASE_URL` (por ejemplo, un PostgreSQL en Docker):
 *   TEST_DATABASE_URL=postgres://postgres:clave@localhost:55432/ecoairlines npm run test:e2e
 * Crea datos, **apaga la API**, la vuelve a levantar contra la misma base y comprueba que todo sigue ahí, incluido el
 * estado del GDS (asiento ocupado) y las rutas y aviones creados por el administrador.
 */
const url = process.env.TEST_DATABASE_URL;
const SCHEMAS = ['bookings', 'offers', 'post_sale', 'check_in', 'customers', 'flight_status', 'webhooks', 'idempotency', 'schedule', 'gds', 'payment'];

describe.skipIf(!url)('Persistencia en PostgreSQL (e2e)', () => {
  let app: NestExpressApplication | undefined;
  const http = () => request(app!.getHttpServer());

  async function dropSchemas(): Promise<void> {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    for (const schema of SCHEMAS) await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }

  beforeAll(async () => {
    await dropSchemas();
    process.env.DATABASE_URL = url;
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.DATABASE_URL;
    await dropSchemas();
  });

  it('las reservas, el inventario del GDS, las rutas, la flota y los perfiles sobreviven a un reinicio', async () => {
    app = await createTestApp();
    const admin = await bearer('admin-1', ['ecoairlines:admin']);
    const customer = await bearer('persist-user', ['flights:read', 'flights:hold', 'flights:book', 'ecoairlines:profile', 'flights:webhooks']);

    // Administrador: un avión nuevo y una ruta con ese avión.
    const plane = (await http().post('/admin/aircraft').set('Authorization', admin).send({ aircraftType: 'Airbus A220-300', base: 'UIO' }).expect(201)).body.registration;
    await http()
      .post('/admin/routes')
      .set('Authorization', admin)
      .send({ origin: 'UIO', destination: 'CUE', outboundDepartureLocal: '07:00', inboundDepartureLocal: '12:00', weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], aircraft: [plane] })
      .expect(201);

    // Cliente: reserva con asiento, perfil y webhook.
    const { holdId, offer } = await createHold(app, 'persist-user', { origin: 'UIO', destination: 'BOG', days: 20 });
    const segmentId = offer.itineraries[0].segments[0].segmentId as string;
    const reference = paymentRef();
    const booking = await http()
      .post('/bookings')
      .set('Authorization', customer)
      .set('Idempotency-Key', randomUUID())
      .send({ holdId, passengers: [passenger('p1', 'ADULT', { assignedSeats: [{ segmentId, seatNumber: '20C' }] })], payment: { paymentReference: reference } })
      .expect(201);
    await http()
      .put('/customers/me')
      .set('Authorization', customer)
      .send({ firstName: 'Ana', lastName: 'Verde', documentType: 'PASSPORT', documentNumber: 'P7654321', nationality: 'EC', birthDate: '1990-05-20', gender: 'F', contact: { email: 'ana@example.com', phone: '+593000000000' } })
      .expect(200);
    await http().post('/webhooks').set('Authorization', customer).send({ url: 'https://example.com/hook', events: ['booking.confirmed'], secret: 'clave-secreta-123' }).expect(201);

    await app.close(); // espera a que se escriban todos los cambios
    app = await createTestApp();

    const detail = await http().get(`/bookings/${booking.body.bookingId}`).set('Authorization', customer).expect(200);
    expect(detail.body).toMatchObject({ pnr: booking.body.pnr, status: 'CONFIRMED' });
    expect((await http().get('/bookings').set('Authorization', customer).expect(200)).body.items).toHaveLength(1);

    const seatMap = await http().get(`/offers/${offer.offerId}/seatmap`).query({ segmentId }).expect(200);
    const seat = seatMap.body.cabins.flatMap((cabin: { rows: { seats: { seatNumber: string; isAvailable: boolean }[] }[] }) => cabin.rows.flatMap((row) => row.seats)).find((candidate: { seatNumber: string }) => candidate.seatNumber === '20C');
    expect(seat.isAvailable).toBe(false);

    expect((await http().get('/customers/me').set('Authorization', customer).expect(200)).body.documentNumber).toBe('P7654321');
    expect((await http().get('/webhooks').set('Authorization', customer).expect(200)).body).toHaveLength(1);

    expect((await http().get(`/admin/aircraft/${plane}`).set('Authorization', admin).expect(200)).body).toMatchObject({ status: 'IN_SERVICE', routes: ['EA300-EA301'] });
    expect((await search(app, { origin: 'UIO', destination: 'CUE', days: 10 })).offers.map((candidate) => candidate.itineraries[0].segments[0].flightNumber)).toContain('EA300');

    // La referencia de pago ya usada sigue registrada en la Payment API simulada.
    const again = await createHold(app, 'persist-user', { origin: 'UIO', destination: 'GYE', days: 15 });
    const reused = await http()
      .post('/bookings')
      .set('Authorization', customer)
      .set('Idempotency-Key', randomUUID())
      .send({ holdId: again.holdId, passengers: [passenger('p1')], payment: { paymentReference: reference } });
    expect(reused.body).toMatchObject({ status: 422, code: 'PAYMENT_REFERENCE_INVALID' });
  });
});
