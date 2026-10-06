import { Inject, Injectable } from '@nestjs/common';
import { DomainEventBus } from '../../common/events/domain-event-bus.js';
import { stableHash } from '@ecoairlines/data-access/common/stable-hash.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import { seatHolder } from '../../common/seating/seat-assigner.js';
import {
  BookingsFacade,
  type BookingSnapshot,
  type PurchasedFare,
  type SeatAssignment,
} from '../bookings/bookings.facade.js';
import { CHECK_IN_REPOSITORY, type CheckInRepository } from '@ecoairlines/data-management/interfaces/check-in/check-in.repository.js';
import { DEPARTURE_CONTROL_GATEWAY, type DepartureControlGateway } from '@ecoairlines/data-management/interfaces/check-in/departure-control.gateway.js';
import type { CheckedInPassengerDto, CheckInResponseDto } from '../../dto/check-in/check-in.dto.js';
import type { BoardingPassDto, BoardingPassListResponseDto } from '../../dto/check-in/boarding-pass.dto.js';

/** Cierre del check-in antes de la salida. */
const CUTOFF_MINUTES = 60;
const BOARDING_GROUP_BY_FARE: Record<string, string> = { DOSEL: 'A', BOSQUE: 'B', BROTE: 'C', SEMILLA: 'D' };

/**
 * Check-in del próximo itinerario de la reserva que aún no sale. Repetirlo devuelve el mismo
 * resultado (operación idempotente; el contrato no exige Idempotency-Key aquí, HALL-12).
 *
 * Los check-ins son datos propios de este dominio (BD futura: `check-in`). La reserva se lee como
 * snapshot; los asientos asignados automáticamente se registran en ella mediante `BookingsFacade`.
 */
@Injectable()
export class CheckInService {
  constructor(
    private readonly bookings: BookingsFacade,
    @Inject(CHECK_IN_REPOSITORY) private readonly checkIns: CheckInRepository,
    @Inject(DEPARTURE_CONTROL_GATEWAY) private readonly departureControl: DepartureControlGateway,
    private readonly events: DomainEventBus,
  ) {}

  /** Apertura de la ventana, configurable con CHECK_IN_WINDOW_HOURS (por defecto 48 h). */
  private get windowHours(): number {
    return Number(process.env.CHECK_IN_WINDOW_HOURS ?? 48);
  }

  async performCheckIn(booking: BookingSnapshot): Promise<CheckInResponseDto> {
    if (booking.status !== 'CONFIRMED') {
      throw new ProblemDetailsException({
        status: 409,
        code: 'BOOKING_NOT_CONFIRMED',
        title: 'Solo se puede hacer check-in de reservas confirmadas.',
      });
    }

    const fare = await this.nextItinerary(booking);
    const checkIns = await this.checkIns.findByBooking(booking.bookingId);
    const newSeats: SeatAssignment[] = [];
    const results: CheckedInPassengerDto[] = [];

    for (const passenger of booking.passengers ?? []) {
      const segments = [];
      for (const segmentId of fare.segmentIds) {
        const existing = checkIns[segmentId]?.[passenger.passengerId];
        let seat: string | null | undefined = existing;

        if (existing === undefined) {
          if (passenger.passengerType === 'INFANT') {
            seat = null;
          } else {
            const chosen = passenger.assignedSeats?.find((assigned) => assigned.segmentId === segmentId)?.seatNumber;
            seat =
              chosen ??
              (await this.departureControl.autoAssignSeat(segmentId, fare.cabinClass, seatHolder(booking.bookingId, passenger.passengerId)));
            if (seat && !chosen) {
              newSeats.push({ passengerId: passenger.passengerId, segmentId, seatNumber: seat });
            }
          }
          if (seat !== undefined) {
            checkIns[segmentId] = { ...checkIns[segmentId], [passenger.passengerId]: seat };
          }
        }

        segments.push({
          segmentId,
          seat: seat ?? null,
          status: seat === undefined ? ('FAILED' as const) : ('CHECKED_IN' as const),
        });
      }
      results.push({
        passengerId: passenger.passengerId,
        status: segments.every((segment) => segment.status === 'CHECKED_IN') ? 'CHECKED_IN' : 'FAILED',
        segments,
      });
    }

    await this.checkIns.save(booking.bookingId, checkIns);
    await this.bookings.recordSeatAssignments(booking.bookingId, newSeats, `Check-in del itinerario ${fare.itineraryId}.`);

    const status = results.every((result) => result.status === 'CHECKED_IN') ? 'COMPLETED' : 'FAILED';
    if (status === 'COMPLETED') {
      this.events.publishBooking('booking.checked_in', await this.bookings.eventSubject(booking.bookingId), { itineraryId: fare.itineraryId, passengers: results.length });
    }
    return { bookingId: booking.bookingId, status, checkedInPassengers: results };
  }

  /** Pases de los segmentos ACTUALES de la reserva: un check-in de un vuelo reemplazado por un cambio de fecha no cuenta. */
  async getBoardingPasses(booking: BookingSnapshot): Promise<BoardingPassListResponseDto> {
    const checkIns = await this.checkIns.findByBooking(booking.bookingId);
    const passes: BoardingPassDto[] = [];
    for (const fare of booking.fares) {
      for (const segmentId of fare.segmentIds) {
        const checkedIn = checkIns[segmentId] ?? {};
        for (const passenger of booking.passengers ?? []) {
          if (!(passenger.passengerId in checkedIn)) continue;
          // El asiento vigente es el de la reserva: si el cliente lo cambió después del check-in, el pase lo refleja.
          const current = passenger.assignedSeats?.find((assigned) => assigned.segmentId === segmentId)?.seatNumber;
          const seat = current ?? checkedIn[passenger.passengerId] ?? 'INF';
          passes.push({
            passengerId: passenger.passengerId,
            segmentId,
            seat,
            boardingGroup: BOARDING_GROUP_BY_FARE[fare.fareBrand] ?? null,
            boardingPosition: String((stableHash(`${segmentId}:${passenger.passengerId}`) % 180) + 1).padStart(3, '0'),
            barcode: barcodeFor(booking.pnr, segmentId, seat, passenger),
            barcodeType: 'QR',
          });
        }
      }
    }

    if (passes.length === 0) {
      throw ProblemDetailsException.notFound(
        'No hay pases de abordar: primero debe realizarse el check-in.',
        'BOARDING_PASS_NOT_AVAILABLE',
      );
    }
    return { bookingId: booking.bookingId, boardingPasses: passes };
  }

  /** Primer itinerario aún no despegado; valida la ventana de check-in (422 del contrato). */
  private async nextItinerary(booking: BookingSnapshot): Promise<PurchasedFare> {
    const now = Date.now();
    for (const fare of booking.fares) {
      const times = await this.departureControl.segmentTimes(fare.segmentIds[0]!);
      if (!times || times.departureUtc <= now) continue;

      if (now < times.departureUtc - this.windowHours * 3_600_000) {
        throw new ProblemDetailsException({
          status: 422,
          code: 'CHECK_IN_NOT_AVAILABLE',
          title: `El check-in abre ${this.windowHours} h antes de la salida.`,
          detail: `Disponible desde ${new Date(times.departureUtc - this.windowHours * 3_600_000).toISOString()}.`,
        });
      }
      if (now > times.departureUtc - CUTOFF_MINUTES * 60_000) {
        throw new ProblemDetailsException({
          status: 422,
          code: 'CUTOFF_PASSED',
          title: `El check-in cierra ${CUTOFF_MINUTES} minutos antes de la salida.`,
        });
      }
      return fare;
    }
    throw new ProblemDetailsException({
      status: 422,
      code: 'CHECK_IN_NOT_AVAILABLE',
      title: 'La reserva no tiene vuelos pendientes de salida.',
    });
  }
}

/**
 * Contenido del código QR, inspirado en el formato IATA BCBP (simplificado):
 * nombre, PNR, vuelo/fecha del segmento y asiento.
 */
function barcodeFor(pnr: string, segmentId: string, seat: string, passenger: { firstName: string; lastName: string }): string {
  const name = `${passenger.lastName}/${passenger.firstName}`
    .toUpperCase()
    .normalize('NFD')
    .replace(/[^A-Z/]/g, '')
    .slice(0, 20)
    .padEnd(20, ' ');
  return `M1${name}E${pnr} ${segmentId} ${seat.padStart(4, '0')}`;
}
