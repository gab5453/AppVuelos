import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';
import { createBooking, localDateInDays, paymentRef } from './helpers/flow.js';

const toCents = (amount: string) => Math.round(Number(amount) * 100);

describe('Posventa (Fase 5: 5.10–5.12) (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const post = async (path: string, body: unknown, scope: string) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', await bearer('owner', [scope]))
      .set('Idempotency-Key', randomUUID())
      .send(body as object);

  const get = async (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', await bearer('owner', ['flights:read']));

  describe('5.10 equipaje', () => {
    it('opciones, compra, total de maletas y límite (409 BAGGAGE_LIMIT_EXCEEDED)', async () => {
      const { bookingId, booking } = await createBooking(app, 'owner', { fareBrand: 'BROTE' });
      const itineraryId = booking.itineraries[0].itineraryId;

      const options = await get(`/bookings/${bookingId}/baggage-options`);
      expect(options.body).toEqual([
        expect.objectContaining({ passengerId: 'p1', itineraryId, maxAllowed: 3, alreadyPurchased: 0 }),
      ]);
      const unitPrice = toCents(options.body[0].price.total);

      const added = await post(
        `/bookings/${bookingId}/baggage`,
        { passengerId: 'p1', itineraryId, quantity: 2, payment: { paymentReference: paymentRef() } },
        'flights:book',
      );
      // BROTE incluye 1 maleta facturada + 2 extra.
      expect(added.status).toBe(200);
      expect(added.body).toEqual({ passengerId: 'p1', itineraryId, totalBaggage: 3 });

      const detail = await get(`/bookings/${bookingId}`);
      expect(toCents(detail.body.grandTotal.total)).toBe(toCents(booking.grandTotal.total) + 2 * unitPrice);
      expect(detail.body.passengers[0].extraBaggage).toEqual([{ itineraryId, quantity: 2 }]);

      const exceeded = await post(
        `/bookings/${bookingId}/baggage`,
        { passengerId: 'p1', itineraryId, quantity: 2, payment: { paymentReference: paymentRef() } },
        'flights:book',
      );
      expect(exceeded.body).toMatchObject({ status: 409, code: 'BAGGAGE_LIMIT_EXCEEDED' });
    });
  });

  describe('5.11 cambio de fecha', () => {
    it('una tarifa SEMILLA no admite cambios (409 FARE_NOT_CHANGEABLE)', async () => {
      const { bookingId, booking } = await createBooking(app, 'owner', { fareBrand: 'SEMILLA' });
      const response = await post(
        `/bookings/${bookingId}/date-change/search`,
        { changes: [{ itineraryId: booking.itineraries[0].itineraryId, newDepartureDate: localDateInDays(31) }] },
        'flights:read',
      );
      expect(response.body).toMatchObject({ status: 409, code: 'FARE_NOT_CHANGEABLE' });
    });

    it('BROTE: cotiza con cargo por cambio y al confirmar reemplaza el itinerario (200 BookingDetail)', async () => {
      const { bookingId, booking } = await createBooking(app, 'owner', { fareBrand: 'BROTE' });
      const oldItinerary = booking.itineraries[0].itineraryId;

      const offers = await post(
        `/bookings/${bookingId}/date-change/search`,
        { changes: [{ itineraryId: oldItinerary, newDepartureDate: localDateInDays(31) }] },
        'flights:read',
      );
      expect(offers.status).toBe(200);
      expect(offers.body.length).toBeGreaterThan(0);
      const offer = offers.body[0];
      expect(offer.priceDifference.changeFee).toBe('50.00');
      expect(toCents(offer.priceDifference.totalToPay)).toBeGreaterThanOrEqual(5000);

      const withoutPayment = await post(`/bookings/${bookingId}/date-change`, { changeOfferId: offer.changeOfferId }, 'flights:book');
      expect(withoutPayment.body).toMatchObject({ status: 409, code: 'PAYMENT_REFERENCE_INVALID' });

      const confirmed = await post(
        `/bookings/${bookingId}/date-change`,
        { changeOfferId: offer.changeOfferId, payment: { paymentReference: paymentRef() } },
        'flights:book',
      );
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.status).toBe('CONFIRMED');
      expect(confirmed.body.itineraries[0].itineraryId).not.toBe(oldItinerary);
      expect(confirmed.body.tickets[0].segments.map((s: { segmentId: string }) => s.segmentId)).toEqual(
        offer.segments.map((s: { segmentId: string }) => s.segmentId),
      );
      expect(toCents(confirmed.body.grandTotal.total)).toBe(toCents(booking.grandTotal.total) + toCents(offer.priceDifference.totalToPay));

      const reused = await post(
        `/bookings/${bookingId}/date-change`,
        { changeOfferId: offer.changeOfferId, payment: { paymentReference: paymentRef() } },
        'flights:book',
      );
      expect(reused.status).toBe(409);
    });
  });

  describe('5.12 cancelación', () => {
    it('tarifa no reembolsable: devuelve impuestos, penaliza la tarifa base; tickets VOIDED/REFUNDED', async () => {
      const { bookingId, booking } = await createBooking(app, 'owner', { fareBrand: 'SEMILLA' });

      const quote = await get(`/bookings/${bookingId}/cancellation-quote`);
      expect(quote.body).toMatchObject({
        isRefundable: false,
        refundAmount: booking.grandTotal.taxes,
        penaltyAmount: booking.grandTotal.baseFare,
        currency: 'USD',
      });

      const unknown = await post(`/bookings/${bookingId}/cancel`, { quoteId: randomUUID() }, 'flights:cancel');
      expect(unknown.status).toBe(409);

      await post(`/bookings/${bookingId}/cancel`, { quoteId: quote.body.quoteId, reason: 'Cambio de planes' }, 'flights:cancel').then(
        (response) => expect(response.status).toBe(200),
      );
      const detail = await get(`/bookings/${bookingId}`);
      expect(detail.body.status).toBe('CANCELLED');
      expect(detail.body.tickets[0].status).toBe('REFUNDED');
      expect(detail.body.changes.at(-1).description).toContain('Cambio de planes');
    });

    it('tarifa reembolsable (BOSQUE): reembolso total y sin penalidad', async () => {
      const { bookingId, booking } = await createBooking(app, 'owner', { fareBrand: 'BOSQUE' });
      const quote = await get(`/bookings/${bookingId}/cancellation-quote`);
      expect(quote.body).toMatchObject({ isRefundable: true, refundAmount: booking.grandTotal.total, penaltyAmount: '0.00' });
    });

    it('cancelar libera los cupos en el inventario', async () => {
      const { bookingId, offer } = await createBooking(app, 'owner');
      const seats = async () => {
        const response = await request(app.getHttpServer())
          .post('/search')
          .set('X-Device-Fingerprint', 'd')
          .send({ itineraries: [{ origin: 'UIO', destination: 'BOG', departureDate: localDateInDays(30) }], passengers: {} });
        return response.body.offers.find((candidate: { offerId: string }) => candidate.offerId === offer.offerId)
          .itineraries[0].pricingOptions[0].availableSeats as number;
      };

      const before = await seats();
      const quote = await get(`/bookings/${bookingId}/cancellation-quote`);
      await post(`/bookings/${bookingId}/cancel`, { quoteId: quote.body.quoteId }, 'flights:cancel');
      expect(await seats()).toBe(before + 1);
    });
  });
});
