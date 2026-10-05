import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bearer } from './auth.js';

/** Fecha local (UTC−5, Quito/Bogotá) dentro de `days` días. */
export function localDateInDays(days: number): string {
  return new Date(Date.now() - 5 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

/** Referencia de pago única: el mock de la Payment API no acepta reutilizarlas. */
export function paymentRef(tag = 'ok'): string {
  return `pay_${tag}_${randomUUID().slice(0, 8)}`;
}

export function passenger(passengerId: string, passengerType = 'ADULT', extra: Record<string, unknown> = {}) {
  return {
    passengerId,
    passengerType,
    firstName: 'Ana',
    lastName: 'Verde',
    documentType: 'PASSPORT',
    documentNumber: `X${passengerId}`,
    nationality: 'EC',
    birthDate: passengerType === 'INFANT' ? '2026-01-15' : '1990-05-20',
    gender: 'F',
    contact: { email: 'ana@example.com', phone: '+593000000000' },
    ...extra,
  };
}

export interface FlowOptions {
  origin?: string;
  destination?: string;
  days?: number;
  passengers?: { adults?: number; youths?: number; children?: number; infants?: number };
  cabinClass?: string;
  fareBrand?: string;
  /** Índice de la oferta a usar (las ofertas se ordenan por precio). */
  offerIndex?: number;
}

export async function search(app: NestExpressApplication, options: FlowOptions = {}) {
  const response = await request(app.getHttpServer())
    .post('/search')
    .set('X-Device-Fingerprint', 'test-device')
    .send({
      itineraries: [
        { origin: options.origin ?? 'UIO', destination: options.destination ?? 'BOG', departureDate: localDateInDays(options.days ?? 30) },
      ],
      passengers: options.passengers ?? { adults: 1 },
    })
    .expect(200);
  return response.body as { totalOffers: number; offers: any[] };
}

export async function createHold(app: NestExpressApplication, sub: string, options: FlowOptions = {}) {
  const { offers } = await search(app, options);
  const offer = offers[options.offerIndex ?? 0];
  const response = await request(app.getHttpServer())
    .post('/offers/hold')
    .set('Authorization', await bearer(sub, ['flights:hold']))
    .set('Idempotency-Key', randomUUID())
    .send({
      offerId: offer.offerId,
      itinerarySelections: offer.itineraries.map((itinerary: any) => ({
        itineraryId: itinerary.itineraryId,
        cabinClass: options.cabinClass ?? 'ECONOMY',
        fareBrand: options.fareBrand ?? 'SEMILLA',
      })),
      passengersBreakdown: options.passengers ?? { adults: 1 },
    })
    .expect(201);
  return { holdId: response.body.holdId as string, hold: response.body, offer };
}

/** Reserva confirmada de un adulto (o los pasajeros indicados) a partir de un hold real. */
export async function createBooking(
  app: NestExpressApplication,
  sub: string,
  options: FlowOptions & { passengerList?: Record<string, unknown>[] } = {},
) {
  const { holdId, hold, offer } = await createHold(app, sub, options);
  const response = await request(app.getHttpServer())
    .post('/bookings')
    .set('Authorization', await bearer(sub, ['flights:book']))
    .set('Idempotency-Key', randomUUID())
    .send({
      holdId,
      passengers: options.passengerList ?? [passenger('p1')],
      payment: { paymentReference: paymentRef() },
    })
    .expect(201);
  return { booking: response.body, hold, offer, bookingId: response.body.bookingId as string };
}
