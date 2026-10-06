import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';
import { expectExtension } from './helpers/contract.js';
import { createBooking, localDateInDays, search } from './helpers/flow.js';

/**
 * CRUD de rutas programadas (extensión fuera del contrato). Cada cambio se publica en el GDS: se valida que la búsqueda,
 * el horario de la flota y el estado de vuelo vean el horario nuevo, y que no se toquen rutas con pasajeros.
 */

const ADMIN = ['ecoairlines:admin'];
const CUSTOMER = ['flights:read', 'flights:hold', 'flights:book'];

/** Días hasta el próximo día de la semana indicado (0 = domingo), al menos a 5 días para que esté a la venta. */
function daysUntil(weekday: number): number {
  for (let days = 5; days < 12; days++) {
    if (new Date(`${localDateInDays(days)}T12:00:00Z`).getUTCDay() === weekday) return days;
  }
  throw new Error('unreachable');
}

const NEW_ROUTE = {
  origin: 'UIO',
  destination: 'CUE',
  outboundDepartureLocal: '07:00',
  inboundDepartureLocal: '12:00',
  weekdays: ['MON', 'WED', 'FRI'],
};

describe('Rutas programadas — CRUD del administrador (e2e)', () => {
  let app: NestExpressApplication;
  let admin: string;

  beforeEach(async () => {
    app = await createTestApp();
    admin = await bearer('admin-1', ADMIN);
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const create = (body: object) => http().post('/admin/routes').set('Authorization', admin).send(body);
  const flightNumbersOn = async (days: number) =>
    (await search(app, { origin: 'UIO', destination: 'CUE', days })).offers.map((offer) => offer.itineraries[0].segments[0].flightNumber);

  it('lista la red base (90 rutas de ida y vuelta) y exige administrador', async () => {
    await http().get('/admin/routes').expect(401);
    await http().get('/admin/routes').set('Authorization', await bearer('customer-1', CUSTOMER)).expect(403);

    const all = await http().get('/admin/routes').set('Authorization', admin).expect(200);
    expectExtension('get', '/admin/routes', all);
    expect(all.body).toHaveLength(90);
    expect(all.body.find((route: { routeId: string }) => route.routeId === 'EA100-EA121')).toMatchObject({
      origin: 'UIO',
      destination: 'GYE',
      aircraft: ['HC-J01'],
      source: 'NETWORK',
      weekdays: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    });

    const fromQuito = await http().get('/admin/routes').query({ airport: 'UIO' }).set('Authorization', admin).expect(200);
    expect(fromQuito.body).toHaveLength(18); // 9 destinos × 2 líneas (una con base en cada ciudad)
    await http().get('/admin/routes').query({ airport: 'uio' }).set('Authorization', admin).expect(400);
  });

  it('crear: los vuelos nuevos se venden solo los días elegidos, con su propio avión', async () => {
    const created = await create(NEW_ROUTE).expect(201);
    expectExtension('post', '/admin/routes', created);
    expect(created.body).toMatchObject({
      routeId: 'EA300-EA301',
      outbound: { flightNumber: 'EA300', origin: 'UIO', destination: 'CUE', departureLocal: '07:00', arrivalDayOffset: 0 },
      inbound: { flightNumber: 'EA301', origin: 'CUE', destination: 'UIO', departureLocal: '12:00' },
      weekdays: ['MON', 'WED', 'FRI'],
      aircraftType: 'Airbus A220-300',
      aircraft: ['HC-J27'],
      customerSeats: 0,
      source: 'ADMIN',
    });

    expect(await flightNumbersOn(daysUntil(1))).toContain('EA300');
    expect(await flightNumbersOn(daysUntil(2))).not.toContain('EA300');

    const monday = localDateInDays(daysUntil(1));
    const fleet = await http().get('/admin/fleet-schedule').query({ date: monday }).set('Authorization', admin).expect(200);
    const plane = fleet.body.aircraft.find((aircraft: { registration: string }) => aircraft.registration === 'HC-J27');
    expect(plane.flights.map((flight: { flightNumber: string }) => flight.flightNumber)).toEqual(['EA300', 'EA301']);
    await http().get(`/flights/EA300/status`).query({ date: monday }).expect(200);

    const read = await http().get('/admin/routes/EA300-EA301').set('Authorization', admin).expect(200);
    expectExtension('get', '/admin/routes/{routeId}', read);

    // El mismo vuelo (ruta, sentido y hora) no se puede duplicar.
    const duplicated = await create({ ...NEW_ROUTE, inboundDepartureLocal: '18:00' }).expect(409);
    expect(duplicated.body.title).toMatch(/Ya existe el vuelo EA300/);
  });

  it('valida la forma (400) y las reglas de la ruta (422)', async () => {
    for (const body of [
      { ...NEW_ROUTE, outboundDepartureLocal: '25:00' },
      { ...NEW_ROUTE, weekdays: [] },
      { ...NEW_ROUTE, weekdays: ['LUN'] },
      { ...NEW_ROUTE, origin: 'uio' },
      { ...NEW_ROUTE, aircraftType: 'Concorde' },
      { ...NEW_ROUTE, extra: true },
    ]) {
      const response = await create(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expectExtension('post', '/admin/routes', response);
    }

    const same = await create({ ...NEW_ROUTE, destination: 'UIO' }).expect(422);
    expect(same.body.invalidParams).toEqual([{ name: 'destination', reason: 'must differ from origin' }]);
    await create({ ...NEW_ROUTE, destination: 'LAX' }).expect(422);
    const range = await create({ ...NEW_ROUTE, destination: 'MAD', aircraftType: 'Airbus A220-300' }).expect(422);
    expect(range.body.title).toMatch(/no tiene alcance/);
    expect((await create({ ...NEW_ROUTE, destination: 'MAD' }).expect(201)).body.aircraftType).toBe('Boeing 787-9');
  });

  it('editar cambia horas y días al instante; 404 si no existe', async () => {
    await create(NEW_ROUTE).expect(201);
    const updated = await http()
      .put('/admin/routes/EA300-EA301')
      .set('Authorization', admin)
      .send({ ...NEW_ROUTE, outboundDepartureLocal: '09:30', weekdays: ['TUE'] })
      .expect(200);
    expectExtension('put', '/admin/routes/{routeId}', updated);
    expect(updated.body).toMatchObject({ routeId: 'EA300-EA301', weekdays: ['TUE'], outbound: { departureLocal: '09:30' } });

    expect(await flightNumbersOn(daysUntil(1))).not.toContain('EA300');
    expect(await flightNumbersOn(daysUntil(2))).toContain('EA300');

    const missing = await http().put('/admin/routes/EA998-EA999').set('Authorization', admin).send(NEW_ROUTE).expect(404);
    expectExtension('put', '/admin/routes/{routeId}', missing);
  });

  it('dar de baja quita los vuelos de la venta; con pasajeros no se puede editar ni borrar (409)', async () => {
    await create(NEW_ROUTE).expect(201);
    await http().delete('/admin/routes/EA300-EA301').set('Authorization', admin).expect(204);
    expect(await flightNumbersOn(daysUntil(1))).not.toContain('EA300');
    await http().get('/admin/routes/EA300-EA301').set('Authorization', admin).expect(404);

    // La red base también se administra; con una reserva, la ruta queda bloqueada.
    const days = daysUntil(1);
    const offers = (await search(app, { origin: 'UIO', destination: 'GYE', days })).offers;
    const offerIndex = offers.findIndex((offer) => offer.itineraries[0].segments[0].flightNumber === 'EA100');
    await createBooking(app, 'route-customer', { origin: 'UIO', destination: 'GYE', days, offerIndex });

    const route = await http().get('/admin/routes/EA100-EA121').set('Authorization', admin).expect(200);
    expect(route.body.customerSeats).toBe(1);
    const blocked = await http().delete('/admin/routes/EA100-EA121').set('Authorization', admin).expect(409);
    expectExtension('delete', '/admin/routes/{routeId}', blocked);
    await http()
      .put('/admin/routes/EA100-EA121')
      .set('Authorization', admin)
      .send({ ...NEW_ROUTE, destination: 'GYE', weekdays: ['MON'] })
      .expect(409);
  });
});
