import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import type { BookingSnapshot, PurchasedFare } from '../../services/bookings/bookings.facade.js';
import type { PostSaleGdsGateway } from '@ecoairlines/data-management/interfaces/post-sale/post-sale-gds.gateway.js';

/** Las operaciones posventa requieren una reserva confirmada (409 BOOKING_NOT_CONFIRMED). */
export function assertConfirmed(booking: BookingSnapshot): void {
  if (booking.status === 'CANCELLED') {
    throw new ProblemDetailsException({ status: 409, code: 'ALREADY_CANCELLED', title: 'La reserva ya fue cancelada.' });
  }
  if (booking.status !== 'CONFIRMED') {
    throw new ProblemDetailsException({
      status: 409,
      code: 'BOOKING_NOT_CONFIRMED',
      title: 'La operación requiere una reserva confirmada.',
      detail: `Estado actual: ${booking.status}.`,
    });
  }
}

export async function hasDeparted(fare: PurchasedFare, gds: PostSaleGdsGateway): Promise<boolean> {
  const times = await gds.segmentTimes(fare.segmentIds[0]!);
  return !times || times.departureUtc <= Date.now();
}

export function findFare(booking: BookingSnapshot, itineraryId: string): PurchasedFare {
  const fare = booking.fares.find((candidate) => candidate.itineraryId === itineraryId);
  if (!fare) {
    // El contrato no documenta 400/404 en estos endpoints (HALL-20); es un error de validación de la petición.
    throw new ProblemDetailsException({
      status: 400,
      code: 'VALIDATION_FAILED',
      title: 'El itinerario no pertenece a la reserva.',
      invalidParams: [{ name: 'itineraryId', reason: 'unknown itineraryId for this booking' }],
    });
  }
  return fare;
}

export function flightAlreadyDeparted(): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 409,
    code: 'FLIGHT_ALREADY_DEPARTED',
    title: 'El vuelo de ese itinerario ya salió.',
  });
}
