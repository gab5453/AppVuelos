import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProblemDetailsException } from '../../../../common/problem-details/problem-details.exception.js';
import type { BookingRecord, BookingRepositoryPort } from '../../domain/ports/booking-repository.port.js';
import { BookingOwnershipGuard } from './booking-ownership.guard.js';

function makeContext(params: Record<string, string>, user?: { sub: string }): ExecutionContext {
  const request: Record<string, unknown> = { params, user };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

const booking: BookingRecord = {
  bookingId: '11111111-1111-1111-1111-111111111111',
  ownerId: 'owner-a',
  pnr: 'ABC123',
  status: 'CONFIRMED',
  grandTotal: { currency: 'USD', total: '0.00' },
  createdAt: new Date().toISOString(),
  internal: { holdId: 'hold-1', counts: { adults: 1, youths: 0, children: 0, infants: 0 }, fares: [], checkIns: {} },
};

describe('BookingOwnershipGuard', () => {
  it('rejects a malformed bookingId with 400 before touching the repository', async () => {
    const repository: BookingRepositoryPort = {
      create: vi.fn(),
      findById: vi.fn(),
      findByPnr: vi.fn(),
      findAllByOwner: vi.fn(),
      update: vi.fn(),
    };
    const guard = new BookingOwnershipGuard(repository);
    const context = makeContext({ bookingId: 'not-a-uuid' }, { sub: 'owner-a' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ProblemDetailsException);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('responds 404 when the booking does not exist', async () => {
    const repository: BookingRepositoryPort = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(undefined),
      findByPnr: vi.fn(),
      findAllByOwner: vi.fn(),
      update: vi.fn(),
    };
    const guard = new BookingOwnershipGuard(repository);
    const context = makeContext({ bookingId: booking.bookingId }, { sub: 'owner-a' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 404 });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('responds 404 (not 403) when the booking belongs to a different owner, to avoid leaking existence', async () => {
    const repository: BookingRepositoryPort = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(booking),
      findByPnr: vi.fn(),
      findAllByOwner: vi.fn(),
      update: vi.fn(),
    };
    const guard = new BookingOwnershipGuard(repository);
    const context = makeContext({ bookingId: booking.bookingId }, { sub: 'someone-else' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 404 });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('allows access and attaches the booking to the request when the owner matches', async () => {
    const repository: BookingRepositoryPort = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(booking),
      findByPnr: vi.fn(),
      findAllByOwner: vi.fn(),
      update: vi.fn(),
    };
    const guard = new BookingOwnershipGuard(repository);
    const request: Record<string, unknown> = { params: { bookingId: booking.bookingId }, user: { sub: 'owner-a' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.booking).toEqual(booking);
  });
});
