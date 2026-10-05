import { ProblemDetailsException } from '../../../common/problem-details/problem-details.exception.js';
import { InMemoryHoldRepository } from '../infrastructure/in-memory-hold.repository.js';
import type { OfferInventoryPort, PricedSelection } from '../domain/ports/offer-inventory.port.js';
import { HoldService, HoldUnavailableError } from './hold.service.js';

const selection: PricedSelection = {
  itineraryId: 'EA300-20261201',
  cabinClass: 'ECONOMY',
  fareBrand: 'SEMILLA',
  segmentIds: ['EA300-20261201'],
  itinerary: { itineraryId: 'EA300-20261201', totalDurationMinutes: 95, stopsCount: 0, segments: [], pricingOptions: [] },
  price: { currency: 'USD', baseFare: '100.00', taxes: '27.00', total: '127.00' },
};

function setup(reserveOk = true) {
  const inventory: OfferInventoryPort = {
    priceSelections: vi.fn().mockResolvedValue({ ok: true, selections: [selection] }),
    reserve: vi.fn().mockResolvedValue(reserveOk),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const service = new HoldService(new InMemoryHoldRepository(), inventory);
  return { service, inventory };
}

const request = {
  offerId: 'EA300-20261201',
  itinerarySelections: [{ itineraryId: 'EA300-20261201', cabinClass: 'ECONOMY', fareBrand: 'SEMILLA' }],
  passengersBreakdown: { adults: 2 },
};

describe('HoldService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retiene cupos para los pasajeros con asiento y congela el precio', async () => {
    const { service, inventory } = setup();
    const hold = await service.createHold('user-1', request);

    expect(hold).toMatchObject({ status: 'HELD', ttlMinutes: 15, lockedPrice: selection.price });
    expect(inventory.reserve).toHaveBeenCalledWith([selection], 2);
  });

  it('rechaza más infantes que adultos con 422 INFANT_SEAT_NOT_ALLOWED', async () => {
    const { service } = setup();
    await expect(
      service.createHold('user-1', { ...request, passengersBreakdown: { adults: 1, infants: 2 } }),
    ).rejects.toMatchObject({ response: { status: 422, code: 'INFANT_SEAT_NOT_ALLOWED' } });
  });

  it('sin cupo responde 409 OFFER_NO_LONGER_AVAILABLE', async () => {
    const { service } = setup(false);
    await expect(service.createHold('user-1', request)).rejects.toMatchObject({
      response: { status: 409, code: 'OFFER_NO_LONGER_AVAILABLE' },
    });
  });

  it('al vencer el TTL pasa a EXPIRED y libera el inventario una sola vez', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
    const { service, inventory } = setup();
    const { holdId } = await service.createHold('user-1', request);

    vi.setSystemTime(new Date('2026-10-03T12:16:00Z'));
    const status = await service.getHoldStatus('user-1', holdId);
    await service.getHoldStatus('user-1', holdId);

    expect(status).toMatchObject({ status: 'EXPIRED', remainingSeconds: 0 });
    expect(inventory.release).toHaveBeenCalledTimes(1);
    await expect(service.getHeldHold('user-1', holdId)).rejects.toEqual(new HoldUnavailableError('EXPIRED'));
  });

  it('el barrido periódico expira holds que nadie volvió a consultar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
    const { service, inventory } = setup();
    await service.createHold('user-1', request);

    vi.setSystemTime(new Date('2026-10-03T12:20:00Z'));
    await service.expireDueHolds();
    expect(inventory.release).toHaveBeenCalledTimes(1);
  });

  it('un hold consumido no puede reutilizarse ni liberarse', async () => {
    const { service, inventory } = setup();
    const { holdId } = await service.createHold('user-1', request);

    await service.consumeHold('user-1', holdId);
    await expect(service.consumeHold('user-1', holdId)).rejects.toEqual(new HoldUnavailableError('NOT_HELD'));
    await service.releaseHold('user-1', holdId);
    expect(inventory.release).not.toHaveBeenCalled();
  });

  it('otro usuario no ve el hold (404)', async () => {
    const { service } = setup();
    const { holdId } = await service.createHold('user-1', request);
    await expect(service.getHoldStatus('user-2', holdId)).rejects.toBeInstanceOf(ProblemDetailsException);
    await expect(service.getHeldHold('user-2', holdId)).rejects.toEqual(new HoldUnavailableError('NOT_FOUND'));
  });
});
