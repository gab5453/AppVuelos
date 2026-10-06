import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bearer } from './helpers/auth.js';
import { createTestApp } from './helpers/app.js';
import { expectExtension } from './helpers/contract.js';
import { localDateInDays } from './helpers/flow.js';

/**
 * CRUD de la flota (extensión fuera del contrato) y rutas con aviones elegidos: el horario valida que cada avión sea del
 * tipo de la ruta, tenga base en el origen, alcance para los días y no quede en dos lugares a la vez.
 */

const ADMIN = ['ecoairlines:admin'];
const ROUTE = { origin: 'UIO', destination: 'CUE', outboundDepartureLocal: '07:00', inboundDepartureLocal: '12:00', weekdays: ['MON', 'WED', 'FRI'] };

/** Días hasta el próximo lunes, al menos a 5 días. */
function daysUntilMonday(): number {
  for (let days = 5; days < 12; days++) if (new Date(`${localDateInDays(days)}T12:00:00Z`).getUTCDay() === 1) return days;
  throw new Error('unreachable');
}

describe('Flota — CRUD de aviones del administrador (e2e)', () => {
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
  const register = (body: object) => http().post('/admin/aircraft').set('Authorization', admin).send(body);
  const createRoute = (body: object) => http().post('/admin/routes').set('Authorization', admin).send(body);
  const fleetSize = async () => (await http().get('/admin/aircraft').set('Authorization', admin).expect(200)).body.length as number;

  it('consulta los tipos (datos maestros) y la flota base de 149 aviones; exige administrador', async () => {
    await http().get('/admin/aircraft').expect(401);
    await http().get('/admin/aircraft-types').set('Authorization', await bearer('customer', ['flights:read'])).expect(403);

    const types = await http().get('/admin/aircraft-types').set('Authorization', admin).expect(200);
    expectExtension('get', '/admin/aircraft-types', types);
    expect(types.body.map((type: { aircraftType: string; inFleet: number; maxRouteKm: number | null }) => [type.aircraftType, type.inFleet, type.maxRouteKm])).toEqual([
      ['Airbus A220-300', 26, 1500],
      ['Airbus A320neo', 56, 4500],
      ['Boeing 787-9', 67, null],
    ]);

    const fleet = await http().get('/admin/aircraft').set('Authorization', admin).expect(200);
    expectExtension('get', '/admin/aircraft', fleet);
    expect(fleet.body).toHaveLength(149);
    expect(fleet.body.find((plane: { registration: string }) => plane.registration === 'HC-J01')).toMatchObject({
      aircraftType: 'Airbus A220-300',
      base: 'UIO',
      status: 'IN_SERVICE',
      routes: ['EA100-EA121'],
      source: 'NETWORK',
    });
    const quito = await http().get('/admin/aircraft').query({ base: 'UIO', aircraftType: 'Boeing 787-9' }).set('Authorization', admin).expect(200);
    expect(quito.body.every((plane: { base: string; aircraftType: string }) => plane.base === 'UIO' && plane.aircraftType === 'Boeing 787-9')).toBe(true);
  });

  it('registra un avión con la siguiente matrícula libre; queda disponible y aparece en el horario de la flota', async () => {
    const created = await register({ aircraftType: 'Airbus A320neo', base: 'UIO' }).expect(201);
    expectExtension('post', '/admin/aircraft', created);
    expect(created.body).toMatchObject({ registration: 'HC-N57', aircraftType: 'Airbus A320neo', base: 'UIO', status: 'AVAILABLE', routes: [], source: 'ADMIN' });
    expect(await fleetSize()).toBe(150);

    const schedule = await http().get('/admin/fleet-schedule').query({ date: localDateInDays(3) }).set('Authorization', admin).expect(200);
    expect(schedule.body.aircraft.find((plane: { registration: string }) => plane.registration === 'HC-N57')).toMatchObject({ base: 'UIO', flights: [] });

    for (const body of [{ aircraftType: 'Concorde', base: 'UIO' }, { aircraftType: 'Airbus A320neo', base: 'uio' }, { aircraftType: 'Airbus A320neo', base: 'UIO', registration: 'HC-X1' }]) {
      const response = await register(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    await register({ aircraftType: 'Airbus A320neo', base: 'LAX' }).expect(422);
  });

  it('una ruta con el avión elegido lo usa (sin agregar aviones) y el avión ya no se puede retirar ni mover', async () => {
    const plane = (await register({ aircraftType: 'Airbus A220-300', base: 'UIO' }).expect(201)).body.registration;
    expect(plane).toBe('HC-J27');

    const route = await createRoute({ ...ROUTE, aircraft: [plane] }).expect(201);
    expectExtension('post', '/admin/routes', route);
    expect(route.body).toMatchObject({ routeId: 'EA300-EA301', aircraftType: 'Airbus A220-300', aircraft: ['HC-J27'] });
    expect(await fleetSize()).toBe(150);

    const monday = localDateInDays(daysUntilMonday());
    const schedule = await http().get('/admin/fleet-schedule').query({ date: monday }).set('Authorization', admin).expect(200);
    const legs = schedule.body.aircraft.find((candidate: { registration: string }) => candidate.registration === 'HC-J27').flights;
    expect(legs.map((leg: { flightNumber: string }) => leg.flightNumber)).toEqual(['EA300', 'EA301']);

    const inService = await http().get(`/admin/aircraft/${plane}`).set('Authorization', admin).expect(200);
    expect(inService.body).toMatchObject({ status: 'IN_SERVICE', routes: ['EA300-EA301'] });
    const blocked = await http().delete(`/admin/aircraft/${plane}`).set('Authorization', admin).expect(409);
    expectExtension('delete', '/admin/aircraft/{registration}', blocked);
    await http().put(`/admin/aircraft/${plane}`).set('Authorization', admin).send({ base: 'GYE' }).expect(409);

    // Al dar de baja la ruta, el avión queda libre: ya se puede mover y retirar.
    await http().delete('/admin/routes/EA300-EA301').set('Authorization', admin).expect(204);
    const moved = await http().put(`/admin/aircraft/${plane}`).set('Authorization', admin).send({ base: 'GYE' }).expect(200);
    expectExtension('put', '/admin/aircraft/{registration}', moved);
    expect(moved.body).toMatchObject({ base: 'GYE', status: 'AVAILABLE' });
    await http().delete(`/admin/aircraft/${plane}`).set('Authorization', admin).expect(204);
    await http().get(`/admin/aircraft/${plane}`).set('Authorization', admin).expect(404);
  });

  it('rechaza aviones de otra base, de otro tipo, inexistentes, ocupados a esa hora o insuficientes (422)', async () => {
    const fromGuayaquil = await createRoute({ ...ROUTE, origin: 'GYE', aircraft: ['HC-J01'] }).expect(422);
    expect(fromGuayaquil.body.detail).toMatch(/HC-J01 tiene base en UIO/);

    await createRoute({ ...ROUTE, aircraft: ['HC-Z99'] }).expect(422);
    const wrongType = await createRoute({ ...ROUTE, aircraftType: 'Airbus A320neo', aircraft: ['HC-J01'] }).expect(422);
    expect(wrongType.body.detail).toMatch(/es un Airbus A220-300/);

    // HC-J01 vuela EA100 UIO→GYE a las 06:00 todos los días: a las 07:00 no puede salir de Quito.
    const busy = await createRoute({ ...ROUTE, aircraft: ['HC-J01'] }).expect(422);
    expect(busy.body.detail).toMatch(/HC-J01/);

    const wide = (await register({ aircraftType: 'Boeing 787-9', base: 'UIO' }).expect(201)).body.registration;
    const long = await createRoute({
      origin: 'UIO',
      destination: 'MAD',
      outboundDepartureLocal: '20:00',
      inboundDepartureLocal: '15:00',
      weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      aircraft: [wide],
    }).expect(422);
    expect(long.body.detail).toMatch(/necesita \d avión\(es\)/);
    expect(await fleetSize()).toBe(150); // nada cambió
  });

  it('sin elegir aviones, la ruta agrega los suyos a la flota y al editarla los conserva', async () => {
    const route = await createRoute(ROUTE).expect(201);
    const [plane] = route.body.aircraft;
    expect(await fleetSize()).toBe(150);
    expect((await http().get(`/admin/aircraft/${plane}`).set('Authorization', admin).expect(200)).body).toMatchObject({ source: 'ADMIN', status: 'IN_SERVICE' });

    const updated = await http().put('/admin/routes/EA300-EA301').set('Authorization', admin).send({ ...ROUTE, weekdays: ['TUE', 'THU'] }).expect(200);
    expect(updated.body.aircraft).toEqual([plane]);
    expect(await fleetSize()).toBe(150);
  });
});
