import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProblemDetailsException } from '../../../../common/problem-details/problem-details.exception.js';
import { BookingsFacade } from '../../application/bookings.facade.js';
import type { BookingRecord } from '../../domain/ports/booking-repository.port.js';
import { InMemoryBookingRepository } from '../../infrastructure/in-memory-booking.repository.js';
import { BookingOwnershipGuard } from './booking-ownership.guard.js';

const booking: BookingRecord = {
  bookingId: '11111111-1111-1111-1111-111111111111',
  ownerId: 'owner-a',
  pnr: 'ABC123',
  status: 'CONFIRMED',
  grandTotal: { currency: 'USD', total: '0.00' },
  createdAt: new Date().toISOString(),
  internal: { holdId: 'hold-1', counts: { adults: 1, youths: 0, children: 0, infants: 0 }, fares: [] },
};

async function setup() {
  const repository = new InMemoryBookingRepository();
  await repository.create(structuredClone(booking));
  const findById = vi.spyOn(repository, 'findById');
  return { guard: new BookingOwnershipGuard(new BookingsFacade(repository)), findById };
}

function makeContext(params: Record<string, string>, user?: { sub: string }) {
  const request: Record<string, unknown> = { params, user };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

describe('BookingOwnershipGuard', () => {
  it('rejects a malformed bookingId with 400 before touching the repository', async () => {
    const { guard, findById } = await setup();
    const { context } = makeContext({ bookingId: 'not-a-uuid' }, { sub: 'owner-a' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ProblemDetailsException);
    expect(findById).not.toHaveBeenCalled();
  });

  it('responds 404 when the booking does not exist', async () => {
    const { guard } = await setup();
    const { context } = makeContext({ bookingId: '22222222-2222-2222-2222-222222222222' }, { sub: 'owner-a' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 404 });
  });

  it('responds 404 (not 403) when the booking belongs to a different owner, to avoid leaking existence', async () => {
    const { guard } = await setup();
    const { context } = makeContext({ bookingId: booking.bookingId }, { sub: 'someone-else' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 404 });
  });

  it('attaches a read-only snapshot (without ownerId) when the owner matches', async () => {
    const { guard } = await setup();
    const { context, request } = makeContext({ bookingId: booking.bookingId }, { sub: 'owner-a' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.booking).toMatchObject({ bookingId: booking.bookingId, pnr: 'ABC123', fares: [], counts: booking.internal.counts });
    expect(request.booking).not.toHaveProperty('ownerId');
    expect(request.booking).not.toHaveProperty('internal');
  });

  it('the snapshot is a copy: changing it does not change the stored booking', async () => {
    const { guard } = await setup();
    const { context, request } = makeContext({ bookingId: booking.bookingId }, { sub: 'owner-a' });
    await guard.canActivate(context);

    (request.booking as { status: string }).status = 'CANCELLED';

    const again = makeContext({ bookingId: booking.bookingId }, { sub: 'owner-a' });
    await guard.canActivate(again.context);
    expect((again.request.booking as { status: string }).status).toBe('CONFIRMED');
  });
});
