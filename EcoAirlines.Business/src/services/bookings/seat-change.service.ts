import { Inject, Injectable } from '@nestjs/common';
import { DomainEventBus } from '../../common/events/domain-event-bus.js';
import {
  RESERVATION_SYSTEM_GATEWAY,
  type ReservationSystemGateway,
} from '@ecoairlines/data-management/interfaces/bookings/reservation-system.gateway.js';
import { SeatAssigner, seatHolder } from '../../common/seating/seat-assigner.js';
import type { ChangeSeatRequestDto, ChangeSeatResponseDto } from '../../dto/bookings/change-seat.dto.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import { BookingsFacade, type BookingSnapshot } from './bookings.facade.js';

/**
 * Cambio de asiento del cliente (`PUT /bookings/{bookingId}/seat`, extensión fuera del contrato tomada de
 * la plantilla del grupo). Usa las mismas reglas que la reserva: el asiento debe existir, ser de la cabina
 * comprada y estar libre; los infantes no tienen asiento. Primero ocupa el nuevo asiento en el GDS y solo
 * después libera el anterior, para no perderlo si el nuevo falla.
 */
@Injectable()
export class SeatChangeService {
  private readonly seats: SeatAssigner;

  constructor(
    private readonly bookings: BookingsFacade,
    @Inject(RESERVATION_SYSTEM_GATEWAY) private readonly reservationSystem: ReservationSystemGateway,
    private readonly events: DomainEventBus,
  ) {
    this.seats = new SeatAssigner(reservationSystem);
  }

  async changeSeat(booking: BookingSnapshot, request: ChangeSeatRequestDto): Promise<ChangeSeatResponseDto> {
    if (booking.status === 'CANCELLED') {
      throw new ProblemDetailsException({ status: 409, code: 'ALREADY_CANCELLED', title: 'No se puede cambiar el asiento de una reserva cancelada.' });
    }
    if (booking.status !== 'CONFIRMED') {
      throw new ProblemDetailsException({
        status: 409,
        code: 'BOOKING_NOT_CONFIRMED',
        title: 'El asiento solo puede cambiarse en una reserva confirmada.',
        detail: `Estado actual: ${booking.status}.`,
      });
    }

    const passengers = booking.passengers ?? [];
    const passenger = request.passengerId
      ? passengers.find((candidate) => candidate.passengerId === request.passengerId)
      : passengers.find((candidate) => candidate.passengerType !== 'INFANT');
    if (!passenger) {
      throw invalid('passengerId', 'El pasajero no existe en la reserva.', 'unknown passengerId');
    }
    if (passenger.passengerType === 'INFANT') {
      throw new ProblemDetailsException({
        status: 422,
        code: 'INFANT_SEAT_NOT_ALLOWED',
        title: 'Los infantes viajan en el regazo de un adulto y no tienen asiento.',
        invalidParams: [{ name: 'passengerId', reason: 'not allowed for INFANT' }],
      });
    }

    const segmentIds = booking.fares.flatMap((fare) => fare.segmentIds);
    const segmentId = request.segmentId ?? (segmentIds.length === 1 ? segmentIds[0] : undefined);
    if (!segmentId) {
      throw invalid('segmentId', 'La reserva tiene varios vuelos: indique el segmentId del asiento a cambiar.', 'required when the booking has several segments');
    }
    const fare = booking.fares.find((candidate) => candidate.segmentIds.includes(segmentId));
    if (!fare) {
      throw invalid('segmentId', 'El segmento no pertenece a la reserva.', 'unknown segmentId');
    }

    const newSeatNumber = request.newSeatNumber.toUpperCase();
    const current = passenger.assignedSeats?.find((seat) => seat.segmentId === segmentId)?.seatNumber;
    if (current !== newSeatNumber) {
      const change = { passengerId: passenger.passengerId, segmentId, seatNumber: newSeatNumber };
      await this.seats.assign(booking.bookingId, [change], new Map([[segmentId, fare.cabinClass]]), 409);
      if (current) {
        await this.reservationSystem.releaseSeat(segmentId, current, seatHolder(booking.bookingId, passenger.passengerId));
      }
      await this.bookings.recordSeatAssignments(
        booking.bookingId,
        [change],
        `Cambio de asiento de ${passenger.passengerId} en ${segmentId}: ${current ?? 'sin asiento'} → ${newSeatNumber}.`,
      );
      this.events.publishBooking('booking.changed', await this.bookings.eventSubject(booking.bookingId), {
        reason: 'SEAT_CHANGE',
        passengerId: passenger.passengerId,
        segmentId,
        seatNumber: newSeatNumber,
      });
    }

    return {
      bookingId: booking.bookingId,
      passengerId: passenger.passengerId,
      seatNumber: newSeatNumber,
      segmentId,
      message: current === newSeatNumber ? 'El pasajero ya tenía ese asiento.' : `Asiento cambiado a ${newSeatNumber}.`,
    };
  }
}

function invalid(name: string, title: string, reason: string): ProblemDetailsException {
  return new ProblemDetailsException({ status: 400, code: 'VALIDATION_FAILED', title, invalidParams: [{ name, reason }] });
}
