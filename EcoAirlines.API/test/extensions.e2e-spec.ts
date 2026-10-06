import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';
import { expectContract, expectExtension } from './helpers/contract.js';
import { createBooking, localDateInDays, passenger } from './helpers/flow.js';

/**
 * V1.D — extensiones fuera del contrato (`contract/ecoairlines-extensions.yaml`): perfil del cliente, cambio de
 * asiento, administración y observabilidad. Cada respuesta se valida contra el anexo, y lo que cambia
 * operaciones del contrato (estado de vuelo, pases de abordar) se valida además contra el contrato.
 */

const ADMIN = ['ecoairlines:admin'];
const CUSTOMER = ['flights:read', 'flights:hold', 'flights:book', 'flights:cancel', 'ecoairlines:profile'];

const profile = {
  firstName: 'Ana',
  lastName: 'Verde',
  documentType: 'PASSPORT',
  documentNumber: 'X1234567',
  nationality: 'EC',
  birthDate: '1990-05-20',
  gender: 'F',
  contact: { email: 'ana@example.com', phone: '+593000000000' },
};

describe('Extensiones fuera del contrato (V1.D) (e2e)', () => {
  let app: NestExpressApplication;
  let admin: string;

  beforeAll(async () => {
    app = await createTestApp();
    admin = await bearer('admin-1', ADMIN);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Primer asiento libre de una cabina en el mapa del contrato. */
  async function freeSeat(offerId: string, segmentId: string, cabinClass = 'ECONOMY', skip: string[] = []): Promise<string> {
    const { body } = await http().get(`/offers/${offerId}/seatmap`).query({ segmentId }).expect(200);
    const seats = (body.cabins as { cabinClass: string; rows: { seats: { seatNumber: string; isAvailable: boolean }[] }[] }[])
      .find((cabin) => cabin.cabinClass === cabinClass)!
      .rows.flatMap((row) => row.seats);
    return seats.find((seat) => seat.isAvailable && !skip.includes(seat.seatNumber))!.seatNumber;
  }

  function seatsInMap(body: { cabins: { cabinClass: string; rows: { seats: { seatNumber: string; isAvailable: boolean }[] }[] }[] }, cabinClass?: string) {
    const cabins = body.cabins.filter((cabin) => !cabinClass || cabin.cabinClass === cabinClass);
    return new Map(cabins.flatMap((cabin) => cabin.rows.flatMap((row) => row.seats.map((seat) => [seat.seatNumber, seat.isAvailable] as const))));
  }

  describe('seguridad del panel de administración', () => {
    it('sin token responde 401, con token de cliente 403 y con token de administrador 200', async () => {
      const anonymous = await http().get('/admin/dashboard-stats').expect(401);
      expectExtension('get', '/admin/dashboard-stats', anonymous);

      const customer = await http().get('/admin/dashboard-stats').set('Authorization', await bearer('customer-1', CUSTOMER)).expect(403);
      expectExtension('get', '/admin/dashboard-stats', customer);

      const ok = await http().get('/admin/dashboard-stats').set('Authorization', admin).expect(200);
      expectExtension('get', '/admin/dashboard-stats', ok);
    });

    it('la observabilidad también exige el scope de administrador', async () => {
      await http().get('/admin/observability').expect(401);
      await http().get('/admin/observability').set('Authorization', await bearer('customer-1', CUSTOMER)).expect(403);
    });
  });

  describe('indicadores y pasajeros (campos de la plantilla del grupo)', () => {
    it('refleja una reserva confirmada en totales, ingresos, rutas, reservas recientes y pasajeros del vuelo', async () => {
      const before = (await http().get('/admin/dashboard-stats').set('Authorization', admin).expect(200)).body;
      const { bookingId, booking } = await createBooking(app, 'stats-user', { origin: 'UIO', destination: 'BOG', days: 25 });

      const response = await http().get('/admin/dashboard-stats').set('Authorization', admin).expect(200);
      expectExtension('get', '/admin/dashboard-stats', response);
      const stats = response.body;
      expect(stats.totalBookings).toBe(before.totalBookings + 1);
      expect(stats.confirmedBookings).toBe(before.confirmedBookings + 1);
      expect(stats.totalPassengers).toBe(before.totalPassengers + 1);
      expect(stats.totalRevenue).toBeCloseTo(before.totalRevenue + Number(booking.grandTotal.total), 2);
      expect(stats.recentBookings[0].bookingId).toBe(bookingId);
      expect(stats.recentBookings[0]).not.toHaveProperty('ownerId');
      const route = stats.routeStats.find((candidate: { route: string }) => candidate.route === 'Bogotá (BOG) ↔ Quito (UIO)');
      expect(route.bookingsCount).toBeGreaterThanOrEqual(1);
      expect(route.flightsCount).toBe(4);

      expect(stats.totalFlightsToday).toBe(stats.flightOccupancies.length);
      for (const flight of stats.flightOccupancies) {
        expect(flight.bookedSeats + flight.availableSeats).toBe(flight.totalSeats);
      }

      const segment = booking.itineraries[0].segments[0];
      const passengers = await http()
        .get(`/admin/flights/${segment.flightNumber}/passengers`)
        .query({ date: segment.departure.at.slice(0, 10) })
        .set('Authorization', admin)
        .expect(200);
      expectExtension('get', '/admin/flights/{flightNumber}/passengers', passengers);
      expect(passengers.body.map((item: { passengerId: string; lastName: string }) => item.lastName)).toContain('Verde');
    });

    it('un vuelo inexistente responde 404 y una fecha inválida 400', async () => {
      const missing = await http().get('/admin/flights/EA999/passengers').set('Authorization', admin).expect(404);
      expectExtension('get', '/admin/flights/{flightNumber}/passengers', missing);
      const invalid = await http().get('/admin/flights/EA104/passengers').query({ date: '2026-02-31' }).set('Authorization', admin).expect(400);
      expectExtension('get', '/admin/flights/{flightNumber}/passengers', invalid);
    });
  });

  describe('estado operativo de un vuelo', () => {
    it('el estado que fija el administrador lo devuelve GET /flights/{flightNumber}/status del contrato', async () => {
      const date = localDateInDays(3);
      const updated = await http()
        .put('/admin/flights/EA104/status')
        .query({ date })
        .set('Authorization', admin)
        .send({ status: 'CANCELLED' })
        .expect(200);
      expectExtension('put', '/admin/flights/{flightNumber}/status', updated);
      expect(updated.body.status).toBe('CANCELLED');

      const status = await http().get('/flights/EA104/status').query({ date }).expect(200);
      expectContract('get', '/flights/{flightNumber}/status', status);
      expect(status.body.status).toBe('CANCELLED');
    });

    it('DEPARTED registra la hora real de salida', async () => {
      const date = localDateInDays(4);
      const { body } = await http().put('/admin/flights/EA105/status').query({ date }).set('Authorization', admin).send({ status: 'DEPARTED' }).expect(200);
      expect(body.status).toBe('DEPARTED');
      expect(body.departure.actualAt).toEqual(expect.any(String));
    });

    it('rechaza estados fuera del enum, propiedades extra y vuelos inexistentes', async () => {
      const badStatus = await http().put('/admin/flights/EA104/status').set('Authorization', admin).send({ status: 'FLYING' }).expect(400);
      expectExtension('put', '/admin/flights/{flightNumber}/status', badStatus);
      await http().put('/admin/flights/EA104/status').set('Authorization', admin).send({ status: 'DELAYED', reason: 'x' }).expect(400);
      const missing = await http().put('/admin/flights/EA999/status').set('Authorization', admin).send({ status: 'DELAYED' }).expect(404);
      expectExtension('put', '/admin/flights/{flightNumber}/status', missing);
    });
  });

  describe('vuelos por fecha, origen y ruta', () => {
    it('por defecto muestra los vuelos de hoy, con cupos de clientes y simulados', async () => {
      const response = await http().get('/admin/flights').set('Authorization', admin).expect(200);
      expectExtension('get', '/admin/flights', response);
      const flights = response.body as { date: string; bookedSeats: number; reservedSeats: number; simulatedSeats: number }[];
      expect(flights).toHaveLength(180);
      expect(new Set(flights.map((flight) => flight.date))).toEqual(new Set([localDateInDays(0)]));
      for (const flight of flights) expect(flight.bookedSeats).toBe(flight.reservedSeats + flight.simulatedSeats);
    });

    it('filtra por origen y por ruta, y refleja las reservas de un día futuro', async () => {
      const days = 40;
      const date = localDateInDays(days);
      const { booking } = await createBooking(app, 'flights-user', { origin: 'GYE', destination: 'CUE', days });
      const flightNumber = booking.itineraries[0].segments[0].flightNumber as string;

      const fromGye = await http().get('/admin/flights').query({ date, origin: 'GYE' }).set('Authorization', admin).expect(200);
      expectExtension('get', '/admin/flights', fromGye);
      expect(fromGye.body).toHaveLength(18);
      expect(fromGye.body.every((flight: { route: string }) => flight.route.startsWith('GYE'))).toBe(true);

      const route = await http().get('/admin/flights').query({ date, origin: 'GYE', destination: 'CUE' }).set('Authorization', admin).expect(200);
      expect(route.body).toHaveLength(2);
      const booked = route.body.find((flight: { flightNumber: string }) => flight.flightNumber === flightNumber);
      expect(booked).toMatchObject({ date, reservedSeats: 1, simulatedSeats: 0, bookedSeats: 1 });
    });

    it('valida los filtros y no publica fechas más allá de los 91 días', async () => {
      expectExtension('get', '/admin/flights', await http().get('/admin/flights').query({ origin: 'quito' }).set('Authorization', admin).expect(400));
      expectExtension('get', '/admin/flights', await http().get('/admin/flights').query({ date: localDateInDays(120) }).set('Authorization', admin).expect(400));
      await http().get('/admin/flights').set('Authorization', await bearer('customer-1', CUSTOMER)).expect(403);
    });
  });

  describe('horario de la flota', () => {
    it('cada avión tiene vuelos encadenados (sale de donde llegó) y ninguno vuela dos a la vez', async () => {
      const date = localDateInDays(10);
      const response = await http().get('/admin/fleet-schedule').query({ date }).set('Authorization', admin).expect(200);
      expectExtension('get', '/admin/fleet-schedule', response);
      const schedule = response.body as {
        totalFlights: number;
        salesWindow: { days: number };
        aircraft: { registration: string; flights: { origin: string; destination: string; departure: string; arrival: string }[] }[];
      };
      expect(schedule.salesWindow.days).toBe(91);
      expect(schedule.totalFlights).toBe(180);
      expect(schedule.aircraft.flatMap((aircraft) => aircraft.flights)).toHaveLength(180);
      for (const aircraft of schedule.aircraft) {
        aircraft.flights.forEach((flight, index) => {
          const previous = aircraft.flights[index - 1];
          if (!previous) return;
          expect(flight.origin, aircraft.registration).toBe(previous.destination);
          expect(Date.parse(flight.departure)).toBeGreaterThan(Date.parse(previous.arrival));
        });
      }
    });

    it('exige administrador y no publica fechas más allá de los 91 días', async () => {
      await http().get('/admin/fleet-schedule').expect(401);
      await http().get('/admin/fleet-schedule').set('Authorization', await bearer('customer-1', CUSTOMER)).expect(403);
      const beyond = await http().get('/admin/fleet-schedule').query({ date: localDateInDays(120) }).set('Authorization', admin).expect(400);
      expectExtension('get', '/admin/fleet-schedule', beyond);
    });
  });

  describe('perfil del cliente', () => {
    it('exige token y el scope ecoairlines:profile', async () => {
      expectExtension('get', '/customers/me', await http().get('/customers/me').expect(401));
      const noScope = await http().get('/customers/me').set('Authorization', await bearer('p-user', ['flights:read'])).expect(403);
      expectExtension('get', '/customers/me', noScope);
    });

    it('404 antes de registrarlo, luego se guarda y se lee; cada cliente ve solo el suyo', async () => {
      const auth = await bearer(`profile-${randomUUID()}`, CUSTOMER);
      expectExtension('get', '/customers/me', await http().get('/customers/me').set('Authorization', auth).expect(404));

      const saved = await http().put('/customers/me').set('Authorization', auth).send(profile).expect(200);
      expectExtension('put', '/customers/me', saved);
      expect(saved.body).toMatchObject(profile);
      expect(saved.body).not.toHaveProperty('ownerId');

      const read = await http().get('/customers/me').set('Authorization', auth).expect(200);
      expectExtension('get', '/customers/me', read);
      expect(read.body).toMatchObject(profile);

      await http().get('/customers/me').set('Authorization', await bearer(`other-${randomUUID()}`, CUSTOMER)).expect(404);
    });

    it('valida los campos (mismas reglas que PassengerItem) y rechaza propiedades extra', async () => {
      const auth = await bearer('profile-invalid', CUSTOMER);
      const invalid = await http().put('/customers/me').set('Authorization', auth).send({ ...profile, nationality: 'Ecuador' }).expect(400);
      expectExtension('put', '/customers/me', invalid);
      await http().put('/customers/me').set('Authorization', auth).send({ ...profile, ownerId: 'otro' }).expect(400);
      await http().put('/customers/me').set('Authorization', auth).send({ ...profile, contact: { ...profile.contact, extra: 1 } }).expect(400);
    });
  });

  describe('cambio de asiento', () => {
    it('ocupa el nuevo asiento, libera el anterior y lo registra en la reserva', async () => {
      const { bookingId, offer } = await createBooking(app, 'seat-user', { origin: 'UIO', destination: 'BOG', days: 26 });
      const segmentId = offer.itineraries[0].segments[0].segmentId as string;
      const auth = await bearer('seat-user', CUSTOMER);

      const first = await freeSeat(offer.offerId, segmentId);
      const changed = await http().put(`/bookings/${bookingId}/seat`).set('Authorization', auth).send({ passengerId: 'p1', newSeatNumber: first }).expect(200);
      expectExtension('put', '/bookings/{bookingId}/seat', changed);
      expect(changed.body).toMatchObject({ bookingId, passengerId: 'p1', seatNumber: first, segmentId });

      const second = await freeSeat(offer.offerId, segmentId, 'ECONOMY', [first]);
      await http().put(`/bookings/${bookingId}/seat`).set('Authorization', auth).send({ newSeatNumber: second }).expect(200);

      const map = seatsInMap((await http().get(`/offers/${offer.offerId}/seatmap`).query({ segmentId }).expect(200)).body);
      expect(map.get(first)).toBe(true);
      expect(map.get(second)).toBe(false);

      const detail = await http().get(`/bookings/${bookingId}`).set('Authorization', auth).expect(200);
      expectContract('get', '/bookings/{bookingId}', detail);
      expect(detail.body.passengers[0].assignedSeats).toEqual([{ segmentId, seatNumber: second }]);
      expect(detail.body.changes.at(-1).description).toContain(second);
    });

    it('rechaza un asiento ocupado (409), de otra cabina (409), de un infante (422) y reservas ajenas (404)', async () => {
      const { bookingId, offer } = await createBooking(app, 'seat-rules', {
        origin: 'UIO',
        destination: 'BOG',
        days: 27,
        passengers: { adults: 1, infants: 1 },
        passengerList: [passenger('a1'), passenger('i1', 'INFANT', { associatedAdultId: 'a1' })],
      });
      const segmentId = offer.itineraries[0].segments[0].segmentId as string;
      const auth = await bearer('seat-rules', CUSTOMER);
      // Otro cliente reserva el mismo vuelo y ocupa un asiento (los vuelos lejanos empiezan vacíos: sin pasajeros simulados).
      const other = await createBooking(app, 'seat-rival', { origin: 'UIO', destination: 'BOG', days: 27 });
      const taken = await freeSeat(offer.offerId, segmentId);
      await http().put(`/bookings/${other.bookingId}/seat`).set('Authorization', await bearer('seat-rival', CUSTOMER)).send({ newSeatNumber: taken }).expect(200);

      const occupied = await http().put(`/bookings/${bookingId}/seat`).set('Authorization', auth).send({ passengerId: 'a1', newSeatNumber: taken }).expect(409);
      expectExtension('put', '/bookings/{bookingId}/seat', occupied);
      expect(occupied.body.code).toBe('SEAT_TAKEN');

      const business = await freeSeat(offer.offerId, segmentId, 'BUSINESS');
      const cabin = await http().put(`/bookings/${bookingId}/seat`).set('Authorization', auth).send({ passengerId: 'a1', newSeatNumber: business }).expect(409);
      expect(cabin.body.code).toBe('SEAT_CABIN_MISMATCH');

      const infant = await http().put(`/bookings/${bookingId}/seat`).set('Authorization', auth).send({ passengerId: 'i1', newSeatNumber: '20A' }).expect(422);
      expectExtension('put', '/bookings/{bookingId}/seat', infant);
      expect(infant.body.code).toBe('INFANT_SEAT_NOT_ALLOWED');

      await http().put(`/bookings/${bookingId}/seat`).set('Authorization', await bearer('intruder', CUSTOMER)).send({ newSeatNumber: '20A' }).expect(404);
      await http().put(`/bookings/${bookingId}/seat`).set('Authorization', await bearer('seat-rules', ['flights:read'])).send({ newSeatNumber: '20A' }).expect(403);
    });

    it('el pase de abordar muestra el asiento nuevo si se cambia después del check-in', async () => {
      const { bookingId, offer } = await createBooking(app, 'seat-checkin', { origin: 'UIO', destination: 'BOG', days: 1 });
      const segmentId = offer.itineraries[0].segments[0].segmentId as string;
      const auth = await bearer('seat-checkin', CUSTOMER);
      await http().post(`/bookings/${bookingId}/check-in`).set('Authorization', auth).expect(200);

      const seat = await freeSeat(offer.offerId, segmentId);
      await http().put(`/bookings/${bookingId}/seat`).set('Authorization', auth).send({ newSeatNumber: seat }).expect(200);

      const passes = await http().get(`/bookings/${bookingId}/boarding-passes`).set('Authorization', auth).expect(200);
      expectContract('get', '/bookings/{bookingId}/boarding-passes', passes);
      expect(passes.body.boardingPasses[0].seat).toBe(seat);
    });
  });

  describe('observabilidad', () => {
    it('agrupa por patrón de ruta, mide latencias y lista errores con X-Request-Id, sin datos sensibles', async () => {
      const auth = await bearer('obs-user', CUSTOMER);
      await http().get('/bookings').query({ pnr: 'SECRET1' }).set('Authorization', auth).expect(200);
      const missing = await http().get(`/bookings/${randomUUID()}`).set('Authorization', auth).expect(404);

      const response = await http().get('/admin/observability').set('Authorization', admin).expect(200);
      expectExtension('get', '/admin/observability', response);
      const snapshot = response.body;
      expect(snapshot.totals.requests).toBeGreaterThan(0);
      expect(snapshot.routes.map((route: { route: string }) => route.route)).toContain('/bookings/:bookingId');
      expect(snapshot.recentErrors).toContainEqual(
        expect.objectContaining({ route: '/bookings/:bookingId', status: 404, requestId: missing.headers['x-request-id'] }),
      );

      const serialized = JSON.stringify(snapshot);
      expect(serialized).not.toContain('SECRET1');
      expect(serialized).not.toContain('Bearer');
      expect(serialized).not.toMatch(/\/bookings\/[0-9a-f]{8}-/);
    });
  });
});
