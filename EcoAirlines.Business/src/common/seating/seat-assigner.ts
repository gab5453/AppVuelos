import type { SeatInventoryGateway } from '@ecoairlines/data-management/interfaces/common/seat-inventory.gateway.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';

export interface SeatRequest {
  passengerId: string;
  segmentId: string;
  seatNumber: string;
}

/** Titular de un asiento en el GDS: la reserva y el pasajero. */
export const seatHolder = (bookingId: string, passengerId: string) => `${bookingId}:${passengerId}`;

/**
 * Valida y asigna asientos elegidos por el pasajero (reserva y cambio de fecha).
 * Todo o nada: si un asiento falla, se liberan los asignados en la misma operación.
 * Es código compartido sin estado (librería), no un servicio con datos: cada dominio lo usa con su propio
 * gateway de asientos (EcoAirlines.DataManagement).
 */
export class SeatAssigner {
  constructor(private readonly gateway: SeatInventoryGateway) {}

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

      const info = await this.gateway.seatInfo(request.segmentId, request.seatNumber);
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
      if (!(await this.gateway.assignSeat(request.segmentId, request.seatNumber, seatHolder(bookingId, request.passengerId)))) {
        await this.release(bookingId, assigned);
        throw seatTaken(request);
      }
      assigned.push(request);
    }
  }

  async release(bookingId: string, seats: SeatRequest[]): Promise<void> {
    for (const seat of seats) {
      await this.gateway.releaseSeat(seat.segmentId, seat.seatNumber, seatHolder(bookingId, seat.passengerId));
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
