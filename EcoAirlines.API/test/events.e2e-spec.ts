import { createHmac, randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DomainEventBus } from '@ecoairlines/business/common/events/domain-event-bus.js';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';
import { expectExtension } from './helpers/contract.js';
import { createBooking, localDateInDays } from './helpers/flow.js';

/**
 * Eventos de dominio (SOA/EDA): los servicios publican en el bus interno y el dominio webhooks los entrega por HTTP POST
 * firmado. Un servidor local hace de suscriptor externo (p. ej. el booking central).
 */

interface Received {
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}

const SECRET = 'secreto-del-suscriptor-123';

describe('Eventos de dominio y webhooks (e2e)', () => {
  let app: NestExpressApplication;
  let server: Server;
  let baseUrl: string;
  let received: Received[];
  let failures: number;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received.push({ path: req.url ?? '', headers: req.headers, body });
        if (req.url === '/fail') {
          failures++;
          res.writeHead(503).end();
        } else {
          res.writeHead(204).end();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(async () => {
    received = [];
    failures = 0;
    process.env.WEBHOOK_DELIVERY = 'http';
    app = await createTestApp();
  });

  afterEach(async () => {
    delete process.env.WEBHOOK_DELIVERY;
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const drain = () => app.get(DomainEventBus).drain();
  const subscribe = async (sub: string, path: string, events: string[]) =>
    http()
      .post('/webhooks')
      .set('Authorization', await bearer(sub, ['flights:webhooks']))
      .send({ url: `${baseUrl}${path}`, events, secret: SECRET })
      .expect(201);
  const payloads = (path: string) => received.filter((hit) => hit.path === path).map((hit) => JSON.parse(hit.body));

  it('una reserva emite booking.confirmed y booking.ticket_issued, firmados, solo al dueño', async () => {
    await subscribe('evt-owner', '/owner', ['booking.confirmed', 'booking.ticket_issued']);
    await subscribe('evt-other', '/other', ['booking.confirmed']);

    const { booking } = await createBooking(app, 'evt-owner', { days: 20 });
    await drain();

    const events = payloads('/owner');
    expect(events.map((event) => event.eventType).sort()).toEqual(['booking.confirmed', 'booking.ticket_issued']);
    expect(events[0]).toMatchObject({ apiVersion: '1.5.0.0', data: { bookingId: booking.bookingId, pnr: booking.pnr, status: 'CONFIRMED' } });
    expect(events[0]).not.toHaveProperty('ownerId');
    expect(payloads('/other')).toEqual([]); // otro cliente no recibe eventos de reservas ajenas

    const [hit] = received;
    const signature = String(hit!.headers['x-ecoairlines-signature']);
    const [, timestamp, digest] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(signature)!;
    expect(createHmac('sha256', SECRET).update(`${timestamp}.${hit!.body}`).digest('hex')).toBe(digest);
    expect(hit!.headers['x-ecoairlines-delivery']).toBe(JSON.parse(hit!.body).eventId);
  });

  it('cancelar emite booking.cancelled con el reembolso; postventa emite baggage_added', async () => {
    await subscribe('evt-owner', '/owner', ['booking.cancelled', 'booking.baggage_added']);
    const { bookingId, booking } = await createBooking(app, 'evt-owner', { days: 20, fareBrand: 'BOSQUE' });
    const owner = await bearer('evt-owner', ['flights:read', 'flights:book', 'flights:cancel']);

    await http()
      .post(`/bookings/${bookingId}/baggage`)
      .set('Authorization', owner)
      .set('Idempotency-Key', randomUUID())
      .send({ passengerId: 'p1', itineraryId: booking.itineraries[0].itineraryId, quantity: 1, payment: { paymentReference: `pay_evt_${randomUUID().slice(0, 8)}` } })
      .expect(200);
    const quote = await http().get(`/bookings/${bookingId}/cancellation-quote`).set('Authorization', owner).expect(200);
    await http()
      .post(`/bookings/${bookingId}/cancel`)
      .set('Authorization', owner)
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: quote.body.quoteId })
      .expect(200);
    await drain();

    const events = payloads('/owner');
    expect(events.map((event) => event.eventType)).toEqual(['booking.baggage_added', 'booking.cancelled']);
    expect(events[0].data).toMatchObject({ bookingId, passengerId: 'p1', quantity: 1 });
    expect(events[1].data).toMatchObject({ bookingId, status: 'CANCELLED', refundAmount: quote.body.refundAmount });
  });

  it('un vuelo cancelado por el administrador llega a todos los suscriptores de flight.cancelled', async () => {
    await subscribe('partner-a', '/flights-a', ['flight.cancelled']);
    await subscribe('partner-b', '/flights-b', ['flight.cancelled', 'flight.schedule_changed']);
    const admin = await bearer('admin-1', ['ecoairlines:admin']);
    const date = localDateInDays(3);

    await http().put('/admin/flights/EA104/status').query({ date }).set('Authorization', admin).send({ status: 'CANCELLED' }).expect(200);
    await http().put('/admin/flights/EA105/status').query({ date }).set('Authorization', admin).send({ status: 'DELAYED' }).expect(200);
    await drain();

    expect(payloads('/flights-a')).toEqual([expect.objectContaining({ eventType: 'flight.cancelled', data: { flightNumber: 'EA104', date, status: 'CANCELLED' } })]);
    expect(payloads('/flights-b').map((event) => event.eventType)).toEqual(['flight.cancelled', 'flight.schedule_changed']);
  });

  it('reintenta 3 veces ante 5xx y el panel muestra cada evento con su entrega', async () => {
    await subscribe('evt-owner', '/owner', ['booking.confirmed']);
    await subscribe('evt-owner', '/fail', ['booking.confirmed']);
    await createBooking(app, 'evt-owner', { days: 20 });
    await drain();
    expect(failures).toBe(3);

    const admin = await bearer('admin-1', ['ecoairlines:admin']);
    const response = await http().get('/admin/events').set('Authorization', admin).expect(200);
    expectExtension('get', '/admin/events', response);
    const confirmed = response.body.find((event: { eventType: string }) => event.eventType === 'booking.confirmed');
    expect(confirmed).not.toHaveProperty('ownerId');
    expect(confirmed.deliveries.map((delivery: { outcome: string; attempts: number }) => [delivery.outcome, delivery.attempts]).sort()).toEqual([
      ['DELIVERED', 1],
      ['FAILED', 3],
    ]);
    await http().get('/admin/events').set('Authorization', await bearer('customer', ['flights:read'])).expect(403);
  });

  it('la URL del webhook debe ser http(s) (contrato: format uri)', async () => {
    const response = await http()
      .post('/webhooks')
      .set('Authorization', await bearer('evt-owner', ['flights:webhooks']))
      .send({ url: 'no-es-url', events: ['booking.confirmed'], secret: SECRET })
      .expect(400);
    expect(response.body.invalidParams[0].name).toBe('url');
  });
});
