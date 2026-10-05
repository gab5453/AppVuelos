import { Inject, Injectable } from '@nestjs/common';
import { stableHash } from '../../../common/hash/stable-hash.js';
import { ProblemDetailsException } from '../../../common/problem-details/problem-details.exception.js';
import { seatHolder } from '../../bookings/application/seat-assignment.service.js';
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRecord,
  type BookingRepositoryPort,
  type PurchasedFare,
} from '../../bookings/domain/ports/booking-repository.port.js';
import {
  RESERVATION_SYSTEM_PORT,
  type ReservationSystemPort,
} from '../../bookings/domain/ports/reservation-system.port.js';
import type { CheckedInPassengerDto, CheckInResponseDto } from '../presentation/dto/check-in.dto.js';
import type { BoardingPassDto, BoardingPassListResponseDto } from '../presentation/dto/boarding-pass.dto.js';

/** Cierre del check-in antes de la salida. */
const CUTOFF_MINUTES = 60;
const BOARDING_GROUP_BY_FARE: Record<string, string> = { DOSEL: 'A', BOSQUE: 'B', BROTE: 'C', SEMILLA: 'D' };

/**
 * Check-in del próximo itinerario de la reserva que aún no sale. Repetirlo devuelve el mismo
 * resultado (operación idempotente; el contrato no exige Idempotency-Key aquí, HALL-12).
 */
@Injectable()
export class CheckInService {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT) private readonly bookingRepository: BookingRepositoryPort,
    @Inject(RESERVATION_SYSTEM_PORT) private readonly reservationSystem: ReservationSystemPort,
  ) {}

  /** Apertura de la ventana, configurable con CHECK_IN_WINDOW_HOURS (por defecto 48 h). */
  private get windowHours(): number {
    return Number(process.env.CHECK_IN_WINDOW_HOURS ?? 48);
  }

  async performCheckIn(booking: BookingRecord): Promise<CheckInResponseDto> {
    if (booking.status !== 'CONFIRMED') {
      throw new ProblemDetailsException({
        status: 409,
        code: 'BOOKING_NOT_CONFIRMED',
        title: 'Solo se puede hacer check-in de reservas confirmadas.',
      });
    }

    const fare = await this.nextItinerary(booking);
    const checkIns = structuredClone(booking.internal.checkIns);
    const passengers = structuredClone(booking.passengers ?? []);
    const results: CheckedInPassengerDto[] = [];

    for (const passenger of passengers) {
      const segments = [];
      for (const segmentId of fare.segmentIds) {
        const existing = checkIns[segmentId]?.[passenger.passengerId];
        let seat: string | null | undefined = existing;

        if (existing === undefined) {
          if (passenger.passengerType === 'INFANT') {
            seat = null;
          } else {
            seat =
              passenger.assignedSeats?.find((assigned) => assigned.segmentId === segmentId)?.seatNumber ??
              (await this.reservationSystem.autoAssignSeat(segmentId, fare.cabinClass, seatHolder(booking.bookingId, passenger.passengerId)));
            if (seat && !passenger.assignedSeats?.some((assigned) => assigned.segmentId === segmentId)) {
              passenger.assignedSeats = [...(passenger.assignedSeats ?? []), { segmentId, seatNumber: seat }];
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

    const now = new Date().toISOString();
    await this.bookingRepository.update(booking.bookingId, {
      passengers,
      internal: { ...booking.internal, checkIns },
      changes: [...(booking.changes ?? []), { changedAt: now, description: `Check-in del itinerario ${fare.itineraryId}.` }],
    });

    return {
      bookingId: booking.bookingId,
      status: results.every((result) => result.status === 'CHECKED_IN') ? 'COMPLETED' : 'FAILED',
      checkedInPassengers: results,
    };
  }

  async getBoardingPasses(booking: BookingRecord): Promise<BoardingPassListResponseDto> {
    const passes: BoardingPassDto[] = [];
    for (const fare of booking.internal.fares) {
      for (const segmentId of fare.segmentIds) {
        const checkedIn = booking.internal.checkIns[segmentId] ?? {};
        for (const passenger of booking.passengers ?? []) {
          if (!(passenger.passengerId in checkedIn)) continue;
          const seat = checkedIn[passenger.passengerId] ?? 'INF';
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
  private async nextItinerary(booking: BookingRecord): Promise<PurchasedFare> {
    const now = Date.now();
    for (const fare of booking.internal.fares) {
      const times = await this.reservationSystem.segmentTimes(fare.segmentIds[0]!);
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
