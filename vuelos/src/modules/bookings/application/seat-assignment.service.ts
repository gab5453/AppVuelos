import { Inject, Injectable } from '@nestjs/common';
import { ProblemDetailsException } from '../../../common/problem-details/problem-details.exception.js';
import { RESERVATION_SYSTEM_PORT, type ReservationSystemPort } from '../domain/ports/reservation-system.port.js';

export interface SeatRequest {
  passengerId: string;
  segmentId: string;
  seatNumber: string;
}

export const seatHolder = (bookingId: string, passengerId: string) => `${bookingId}:${passengerId}`;

/**
 * Valida y asigna asientos elegidos por el pasajero (reserva y cambio de fecha).
 * Todo o nada: si un asiento falla, se liberan los asignados en la misma operación.
 */
@Injectable()
export class SeatAssignmentService {
  constructor(@Inject(RESERVATION_SYSTEM_PORT) private readonly reservationSystem: ReservationSystemPort) {}

  /**
   * @param cabinBySegment cabina comprada en cada segmento.
   * @param mismatchStatus el contrato documenta 422 en la reserva y solo 409 en el cambio de fecha.
   */
  async assign(
    bookingId: string,
    requests: SeatRequest[],
    cabinBySegment: Map<string, string>,
    mismatchStatus: 409 | 422,
  ): Promise<void> {
    const seen = new Set<string>();
    for (const request of requests) {
      const key = `${request.segmentId}:${request.seatNumber}`;
      if (seen.has(key)) throw seatTaken(request);
      seen.add(key);

      const info = await this.reservationSystem.seatInfo(request.segmentId, request.seatNumber);
      if (!info) {
        throw new ProblemDetailsException({
          status: mismatchStatus,
          code: 'VALIDATION_FAILED',
          title: 'El asiento no existe en el avión del segmento.',
          invalidParams: [{ name: 'assignedSeats', reason: `${request.seatNumber} does not exist on ${request.segmentId}` }],
        });
      }
      if (info.cabinClass !== cabinBySegment.get(request.segmentId)) {
        throw new ProblemDetailsException({
          status: mismatchStatus,
          code: 'SEAT_CABIN_MISMATCH',
          title: 'El asiento no corresponde a la cabina adquirida.',
          invalidParams: [{ name: 'assignedSeats', reason: `${request.seatNumber} is ${info.cabinClass}` }],
        });
      }
    }

    const assigned: SeatRequest[] = [];
    for (const request of requests) {
      if (!(await this.reservationSystem.assignSeat(request.segmentId, request.seatNumber, seatHolder(bookingId, request.passengerId)))) {
        await this.release(bookingId, assigned);
        throw seatTaken(request);
      }
      assigned.push(request);
    }
  }

  async release(bookingId: string, seats: SeatRequest[]): Promise<void> {
    for (const seat of seats) {
      await this.reservationSystem.releaseSeat(seat.segmentId, seat.seatNumber, seatHolder(bookingId, seat.passengerId));
    }
  }
}

function seatTaken(request: SeatRequest): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 409,
    code: 'SEAT_TAKEN',
    title: 'El asiento ya está ocupado.',
    invalidParams: [{ name: 'assignedSeats', reason: `${request.seatNumber} on ${request.segmentId} is taken` }],
  });
}
