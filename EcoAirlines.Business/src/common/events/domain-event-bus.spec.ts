import { DomainEventBus } from './domain-event-bus.js';

describe('DomainEventBus', () => {
  it('entrega cada evento a todos los consumidores después de publicarlo, con la forma del WebhookPayload', async () => {
    const bus = new DomainEventBus();
    const seen: string[] = [];
    bus.subscribe('a', async (event) => {
      seen.push(`a:${event.eventType}`);
      return [{ consumer: 'a', target: 'x', outcome: 'DELIVERED' }];
    });
    bus.subscribe('b', async (event) => {
      seen.push(`b:${event.eventType}`);
      return [];
    });

    const event = bus.publish({ eventType: 'flight.cancelled', data: { flightNumber: 'EA104' } });
    expect(seen).toEqual([]); // no corre dentro de la operación que publica
    await bus.drain();

    expect(seen).toEqual(['a:flight.cancelled', 'b:flight.cancelled']);
    expect(event).toMatchObject({ eventType: 'flight.cancelled', apiVersion: '1.5.0.0', data: { flightNumber: 'EA104' } });
    expect(bus.recent()[0]!.deliveries).toEqual([{ consumer: 'a', target: 'x', outcome: 'DELIVERED' }]);
  });

  it('un consumidor que falla no impide a los demás y queda registrado', async () => {
    const bus = new DomainEventBus();
    const calls: string[] = [];
    bus.subscribe('roto', async () => {
      throw new Error('boom');
    });
    bus.subscribe('sano', async () => {
      calls.push('sano');
      return [];
    });

    bus.publishBooking('booking.confirmed', { bookingId: 'b1', pnr: 'ABC123', status: 'CONFIRMED', ownerId: 'u1' });
    await bus.drain();

    expect(calls).toEqual(['sano']);
    const [recorded] = bus.recent();
    expect(recorded).toMatchObject({ ownerId: 'u1', data: { bookingId: 'b1', pnr: 'ABC123', status: 'CONFIRMED' } });
    expect(recorded!.deliveries).toEqual([expect.objectContaining({ consumer: 'roto', outcome: 'FAILED' })]);
  });

  it('guarda solo los últimos 100 eventos, el más reciente primero', async () => {
    const bus = new DomainEventBus();
    for (let index = 0; index < 120; index++) bus.publish({ eventType: 'flight.schedule_changed', data: { index } });
    await bus.drain();
    expect(bus.recent(200)).toHaveLength(100);
    expect(bus.recent(1)[0]!.data.index).toBe(119);
  });
});
