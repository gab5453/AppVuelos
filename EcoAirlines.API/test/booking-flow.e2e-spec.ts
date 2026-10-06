import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';
import { createBooking, createHold, localDateInDays, passenger, paymentRef, search } from './helpers/flow.js';

const toCents = (amount: string) => Math.round(Number(amount) * 100);

describe('Flujo de compra (Fase 5) (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  async function book(sub: string, holdId: string, passengers: unknown[], reference = paymentRef()) {
    return request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', await bearer(sub, ['flights:book']))
      .set('Idempotency-Key', randomUUID())
      .send({ holdId, passengers, payment: { paymentReference: reference } });
  }

  describe('5.1 búsqueda', () => {
    it('devuelve ofertas con la forma del contrato, ordenadas por precio', async () => {
      const result = await search(app, { passengers: { adults: 2, children: 1 } });

      expect(result.totalOffers).toBe(result.offers.length);
      expect(result.offers.length).toBeGreaterThan(0);
      const [offer] = result.offers;
      expect(offer.airline).toEqual({ code: 'EA', name: 'EcoAirlines' });
      const pricing = offer.itineraries[0].pricingOptions.map((option: { fareBrand: string }) => option.fareBrand);
      expect(pricing).toEqual(['SEMILLA', 'BROTE', 'BOSQUE', 'DOSEL']);
      expect(offer.itineraries[0].pricingOptions[0].pricePerPassengerType.map((p: { passengerType: string }) => p.passengerType)).toEqual(['ADULT', 'CHILD']);
      const totals = result.offers.map((candidate) => toCents(candidate.grandTotal.total));
      expect(totals).toEqual([...totals].sort((a, b) => a - b));
    });

    it('ida y vuelta combina ambos tramos en cada oferta', async () => {
      const response = await request(app.getHttpServer())
        .post('/search')
        .set('X-Device-Fingerprint', 'd')
        .send({
          itineraries: [
            { origin: 'UIO', destination: 'MAD', departureDate: localDateInDays(30) },
            { origin: 'MAD', destination: 'UIO', departureDate: localDateInDays(40) },
          ],
          passengers: {},
        })
        .expect(200);
      expect(response.body.offers[0].itineraries).toHaveLength(2);
      expect(response.body.offers[0].offerId).toContain('~');
    });

    it('rechaza fechas imposibles (REV-01) y más infantes que adultos', async () => {
      for (const body of [
        { itineraries: [{ origin: 'UIO', destination: 'BOG', departureDate: '2026-02-31' }], passengers: {} },
        { itineraries: [{ origin: 'UIO', destination: 'BOG', departureDate: localDateInDays(30) }], passengers: { adults: 1, infants: 2 } },
      ]) {
        await request(app.getHttpServer()).post('/search').set('X-Device-Fingerprint', 'd').send(body).expect(400);
      }
    });

    it('una ruta sin vuelos devuelve cero ofertas', async () => {
      expect((await search(app, { origin: 'CUE', destination: 'SCL', days: 30 })).totalOffers).toBeGreaterThanOrEqual(0);
      expect((await search(app, { origin: 'UIO', destination: 'XXX' })).totalOffers).toBe(0);
    });
  });

  describe('5.2 mapa de asientos', () => {
    it('devuelve cabinas y asientos; segmentId es obligatorio (REV-03) y debe pertenecer a la oferta', async () => {
      const { offers } = await search(app);
      const offer = offers[0];
      const segmentId = offer.itineraries[0].segments[0].segmentId;

      const map = await request(app.getHttpServer()).get(`/offers/${offer.offerId}/seatmap`).query({ segmentId }).expect(200);
      expect(map.body.segmentId).toBe(segmentId);
      expect(map.body.cabins.length).toBeGreaterThan(0);

      await request(app.getHttpServer()).get(`/offers/${offer.offerId}/seatmap`).expect(400);
      await request(app.getHttpServer()).get(`/offers/${offer.offerId}/seatmap`).query({ segmentId: 'EA999-20261201' }).expect(404);
    });
  });

  describe('5.3 hold', () => {
    it('congela un precio > 0 y descuenta cupos del inventario', async () => {
      const before = (await search(app)).offers[0];
      const seatsBefore = before.itineraries[0].pricingOptions[0].availableSeats;

      const { hold, offer } = await createHold(app, 'user-a', { passengers: { adults: 2 } });
      expect(toCents(hold.lockedPrice.total)).toBeGreaterThan(0);

      const after = (await search(app)).offers.find((candidate) => candidate.offerId === offer.offerId);
      expect(after.itineraries[0].pricingOptions[0].availableSeats).toBe(seatsBefore - 2);
    });

    it('valida la oferta y las selecciones con los códigos del contrato', async () => {
      const { offers } = await search(app);
      const offer = offers[0];
      const itineraryId = offer.itineraries[0].itineraryId;
      const send = async (body: Record<string, unknown>) =>
        request(app.getHttpServer())
          .post('/offers/hold')
          .set('Authorization', await bearer('user-a', ['flights:hold']))
          .set('Idempotency-Key', randomUUID())
          .send({ offerId: offer.offerId, passengersBreakdown: {}, ...body });

      expect((await send({ offerId: 'EA999-20261201', itinerarySelections: [] })).body.code).toBe('OFFER_NO_LONGER_AVAILABLE');
      expect((await send({ itinerarySelections: [] })).status).toBe(422);
      expect((await send({ itinerarySelections: [{ itineraryId, cabinClass: 'FIRST', fareBrand: 'SEMILLA' }] })).status).toBe(422);
      const infants = await send({
        itinerarySelections: [{ itineraryId, cabinClass: 'ECONOMY', fareBrand: 'SEMILLA' }],
        passengersBreakdown: { adults: 1, infants: 2 },
      });
      expect(infants.body).toMatchObject({ status: 422, code: 'INFANT_SEAT_NOT_ALLOWED' });
    });

    it('liberar un hold lo deja RELEASED y devuelve los cupos', async () => {
      const { holdId } = await createHold(app, 'user-a');
      await request(app.getHttpServer())
        .delete(`/offers/hold/${holdId}`)
        .set('Authorization', await bearer('user-a', ['flights:hold']))
        .expect(204);
      const status = await request(app.getHttpServer())
        .get(`/offers/hold/${holdId}`)
        .set('Authorization', await bearer('user-a', ['flights:read']))
        .expect(200);
      expect(status.body).toMatchObject({ status: 'RELEASED', remainingSeconds: 0 });
    });
  });

  describe('5.4 / 5.5 reserva', () => {
    it('201 CONFIRMED con tickets emitidos, itinerarios, pasajeros y el precio del hold', async () => {
      const { booking, hold } = await createBooking(app, 'user-a');

      expect(booking).toMatchObject({ status: 'CONFIRMED', grandTotal: hold.lockedPrice });
      expect(booking.pnr).toMatch(/^[A-Z2-9]{6}$/);
      expect(booking.itineraries[0].pricingOptions).toHaveLength(1);
      expect(booking.passengers).toHaveLength(1);
      expect(booking.tickets[0]).toMatchObject({ status: 'ISSUED', passengerId: 'p1' });
      expect(booking.tickets[0].eTicketNumber).toMatch(/^999\d{10}$/);
      expect(booking).not.toHaveProperty('ownerId');
      expect(booking).not.toHaveProperty('internal');

      const holdStatus = await request(app.getHttpServer())
        .get(`/offers/hold/${hold.holdId}`)
        .set('Authorization', await bearer('user-a', ['flights:read']))
        .expect(200);
      expect(holdStatus.body.status).toBe('CONSUMED');
    });

    it('un hold ya usado responde 409 y uno inexistente 422 (POST /bookings no documenta 404)', async () => {
      const { holdId } = await createHold(app, 'user-a');
      expect((await book('user-a', holdId, [passenger('p1')])).status).toBe(201);

      const reused = await book('user-a', holdId, [passenger('p1')]);
      expect(reused.body).toMatchObject({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE' });

      const unknown = await book('user-a', randomUUID(), [passenger('p1')]);
      expect(unknown.body).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    });

    it('rechaza pasajeros que no coinciden con el hold (422)', async () => {
      const { holdId } = await createHold(app, 'user-a', { passengers: { adults: 2 } });
      const response = await book('user-a', holdId, [passenger('p1')]);
      expect(response.body).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    });

    it('acepta adulto + infante asociado; el infante tiene ticket pero no asiento', async () => {
      const { holdId } = await createHold(app, 'user-a', { passengers: { adults: 1, infants: 1 } });
      const response = await book('user-a', holdId, [passenger('a1'), passenger('i1', 'INFANT', { associatedAdultId: 'a1' })]);
      expect(response.status).toBe(201);
      expect(response.body.tickets).toHaveLength(2);
    });

    it('asientos: valida cabina (422 SEAT_CABIN_MISMATCH) y ocupación (409 SEAT_TAKEN)', async () => {
      const first = await createHold(app, 'user-a');
      const segmentId = first.offer.itineraries[0].segments[0].segmentId;
      const map = await request(app.getHttpServer())
        .get(`/offers/${first.offer.offerId}/seatmap`)
        .query({ segmentId })
        .expect(200);
      const freeSeat = (cabin: string) =>
        map.body.cabins
          .find((candidate: { cabinClass: string }) => candidate.cabinClass === cabin)
          .rows.flatMap((row: { seats: { seatNumber: string; isAvailable: boolean }[] }) => row.seats)
          .find((seat: { isAvailable: boolean }) => seat.isAvailable).seatNumber as string;

      const mismatch = await book('user-a', first.holdId, [
        passenger('p1', 'ADULT', { assignedSeats: [{ segmentId, seatNumber: freeSeat('BUSINESS') }] }),
      ]);
      expect(mismatch.body).toMatchObject({ status: 422, code: 'SEAT_CABIN_MISMATCH' });

      const seat = freeSeat('ECONOMY');
      expect((await book('user-a', first.holdId, [passenger('p1', 'ADULT', { assignedSeats: [{ segmentId, seatNumber: seat }] })])).status).toBe(201);

      const second = await createHold(app, 'user-b');
      const taken = await book('user-b', second.holdId, [passenger('p1', 'ADULT', { assignedSeats: [{ segmentId, seatNumber: seat }] })]);
      expect(taken.body).toMatchObject({ status: 409, code: 'SEAT_TAKEN' });
    });

    it('pagos: referencia inválida o reutilizada, rechazada y asíncrona (202 → CONFIRMED)', async () => {
      process.env.ASYNC_PROCESSING_DELAY_MS = '50';
      try {
        const reference = paymentRef();
        const used = await createHold(app, 'user-a');
        expect((await book('user-a', used.holdId, [passenger('p1')], reference)).status).toBe(201);

        const reused = await createHold(app, 'user-a');
        expect((await book('user-a', reused.holdId, [passenger('p1')], reference)).body.code).toBe('PAYMENT_REFERENCE_INVALID');
        expect((await book('user-a', reused.holdId, [passenger('p1')], 'tarjeta-4111')).body.code).toBe('PAYMENT_REFERENCE_INVALID');
        expect((await book('user-a', reused.holdId, [passenger('p1')], paymentRef('declined'))).body.code).toBe('PAYMENT_NOT_AUTHORIZED');

        const pending = await book('user-a', reused.holdId, [passenger('p1')], paymentRef('async'));
        expect(pending.status).toBe(202);
        expect(pending.body).toMatchObject({ status: 'PENDING_PAYMENT' });
        expect(pending.body.tickets[0].status).toBe('PENDING');

        await new Promise((resolve) => setTimeout(resolve, 200));
        const detail = await request(app.getHttpServer())
          .get(`/bookings/${pending.body.bookingId}`)
          .set('Authorization', await bearer('user-a', ['flights:read']))
          .expect(200);
        expect(detail.body.status).toBe('CONFIRMED');
        expect(detail.body.tickets[0].status).toBe('ISSUED');
      } finally {
        delete process.env.ASYNC_PROCESSING_DELAY_MS;
      }
    });
  });

  describe('5.6 listado', () => {
    it('filtra por pnr y status, pagina con cursor e incluye origen/destino', async () => {
      const ids: string[] = [];
      for (let index = 0; index < 3; index++) ids.push((await createBooking(app, 'user-list')).bookingId);
      const auth = await bearer('user-list', ['flights:read']);

      const page1 = await request(app.getHttpServer()).get('/bookings').query({ limit: 2 }).set('Authorization', auth).expect(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.items[0]).toMatchObject({ origin: 'UIO', destination: 'BOG', status: 'CONFIRMED' });
      expect(page1.body.nextCursor).toBeDefined();

      const page2 = await request(app.getHttpServer())
        .get('/bookings')
        .query({ limit: 2, cursor: page1.body.nextCursor })
        .set('Authorization', auth)
        .expect(200);
      expect(page2.body.items).toHaveLength(1);
      expect(page2.body).not.toHaveProperty('nextCursor');
      expect([...page1.body.items, ...page2.body.items].map((item: { bookingId: string }) => item.bookingId).sort()).toEqual(ids.sort());

      const pnr = page1.body.items[0].pnr;
      const byPnr = await request(app.getHttpServer()).get('/bookings').query({ pnr }).set('Authorization', auth).expect(200);
      expect(byPnr.body.items).toHaveLength(1);
      const cancelled = await request(app.getHttpServer()).get('/bookings').query({ status: 'CANCELLED' }).set('Authorization', auth).expect(200);
      expect(cancelled.body.items).toHaveLength(0);

      await request(app.getHttpServer()).get('/bookings').query({ cursor: 'basura' }).set('Authorization', auth).expect(400);
      await request(app.getHttpServer()).get('/bookings').query({ limit: 51 }).set('Authorization', auth).expect(400);
    });
  });

  describe('5.7 check-in y pases de abordar', () => {
    it('fuera de la ventana de 48 h responde 422 CHECK_IN_NOT_AVAILABLE', async () => {
      const { bookingId } = await createBooking(app, 'user-a', { days: 30 });
      const response = await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/check-in`)
        .set('Authorization', await bearer('user-a', ['flights:book']))
        .expect(422);
      expect(response.body.code).toBe('CHECK_IN_NOT_AVAILABLE');
    });

    it('vuelo de mañana: asigna asiento, completa el check-in y emite pases con QR', async () => {
      const { bookingId } = await createBooking(app, 'user-a', {
        days: 1,
        passengers: { adults: 1, infants: 1 },
        passengerList: [passenger('a1'), passenger('i1', 'INFANT', { associatedAdultId: 'a1' })],
      });
      const read = await bearer('user-a', ['flights:read']);

      const before = await request(app.getHttpServer()).get(`/bookings/${bookingId}/boarding-passes`).set('Authorization', read).expect(404);
      expect(before.body.code).toBe('BOARDING_PASS_NOT_AVAILABLE');

      const checkIn = await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/check-in`)
        .set('Authorization', await bearer('user-a', ['flights:book']))
        .expect(200);
      expect(checkIn.body.status).toBe('COMPLETED');
      const adult = checkIn.body.checkedInPassengers.find((p: { passengerId: string }) => p.passengerId === 'a1');
      const infant = checkIn.body.checkedInPassengers.find((p: { passengerId: string }) => p.passengerId === 'i1');
      expect(adult.segments[0].seat).toMatch(/^\d+[A-K]$/);
      expect(infant.segments[0]).toMatchObject({ seat: null, status: 'CHECKED_IN' });

      const again = await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/check-in`)
        .set('Authorization', await bearer('user-a', ['flights:book']))
        .expect(200);
      expect(again.body).toEqual(checkIn.body);

      const passes = await request(app.getHttpServer()).get(`/bookings/${bookingId}/boarding-passes`).set('Authorization', read).expect(200);
      expect(passes.body.boardingPasses).toHaveLength(2);
      expect(passes.body.boardingPasses[0]).toMatchObject({ barcodeType: 'QR', boardingGroup: 'D' });
      expect(passes.body.boardingPasses.find((pass: { passengerId: string }) => pass.passengerId === 'i1').seat).toBe('INF');
    });
  });

  describe('5.8 estado de vuelo', () => {
    it('un vuelo vendido tiene estado consultable y coherente con el itinerario', async () => {
      const { offers } = await search(app);
      const segment = offers[0].itineraries[0].segments[0];
      const date = segment.departure.at.slice(0, 10);

      const status = await request(app.getHttpServer()).get(`/flights/${segment.flightNumber}/status`).query({ date }).expect(200);
      expect(status.body).toMatchObject({
        flightNumber: segment.flightNumber,
        date,
        departure: { iataCode: segment.departure.iataCode, scheduledAt: segment.departure.at },
      });
      expect(['SCHEDULED', 'DELAYED']).toContain(status.body.status);

      await request(app.getHttpServer()).get(`/flights/${segment.flightNumber}/status`).query({ date: '2026-02-30' }).expect(400);
    });
  });
});
