import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BookingDetail } from '../../../common/contract-types/booking.types.js';
import { formatCents, moneyFromCents, sumMoney, toCents } from '../../../common/money/money.js';
import { seatsRequired } from '../../../common/passengers/passenger-counts.js';
import { ProblemDetailsException } from '../../../common/problem-details/problem-details.exception.js';
import { DeferredTaskRunner } from '../../../common/scheduling/deferred-task-runner.js';
import { paymentProblem } from '../../bookings/application/bookings.service.js';
import { SeatAssignmentService, seatHolder, type SeatRequest } from '../../bookings/application/seat-assignment.service.js';
import { reissueCoupons, toBookingDetail } from '../../bookings/domain/booking-records.js';
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRecord,
  type BookingRepositoryPort,
  type PurchasedFare,
} from '../../bookings/domain/ports/booking-repository.port.js';
import { PAYMENT_VERIFIER_PORT, type PaymentVerifierPort } from '../../bookings/domain/ports/payment-verifier.port.js';
import {
  RESERVATION_SYSTEM_PORT,
  type PricedItinerary,
  type ReservationSystemPort,
} from '../../bookings/domain/ports/reservation-system.port.js';
import { assertConfirmed, findFare, flightAlreadyDeparted, hasDeparted } from '../domain/post-sale-rules.js';
import { DATE_CHANGE_OFFER_STORE, type QuoteStorePort } from '../domain/ports/quote-store.port.js';
import type {
  DateChangeOfferDto,
  DateChangeRequestDto,
  DateChangeSearchRequestDto,
  DateChangeSearchResponseDto,
} from '../presentation/dto/date-change.dto.js';

const OFFER_TTL_MINUTES = 15;
const MAX_CHANGE_OFFERS = 10;

interface Replacement {
  oldItineraryId: string;
  cabinClass: string;
  fareBrand: string;
  next: PricedItinerary;
}

export interface DateChangeOfferPayload {
  replacements: Replacement[];
  totalToPayCents: number;
}

export interface DateChangeResult {
  /** 200: cambio confirmado. 202: pago en proceso (CHANGE_PENDING). */
  statusCode: 200 | 202;
  body?: BookingDetail;
}

@Injectable()
export class DateChangeService {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT) private readonly bookingRepository: BookingRepositoryPort,
    @Inject(RESERVATION_SYSTEM_PORT) private readonly reservationSystem: ReservationSystemPort,
    @Inject(PAYMENT_VERIFIER_PORT) private readonly payments: PaymentVerifierPort,
    @Inject(DATE_CHANGE_OFFER_STORE) private readonly offers: QuoteStorePort<DateChangeOfferPayload>,
    private readonly seats: SeatAssignmentService,
    private readonly tasks: DeferredTaskRunner,
  ) {}

  async search(booking: BookingRecord, request: DateChangeSearchRequestDto): Promise<DateChangeSearchResponseDto> {
    assertConfirmed(booking);
    if (request.changes.length === 0) return [];

    const alternativesPerChange: Replacement[][] = [];
    for (const change of request.changes) {
      const fare = findFare(booking, change.itineraryId);
      await this.assertChangeable(fare);
      const current = booking.itineraries?.find((itinerary) => itinerary.itineraryId === fare.itineraryId);
      const origin = current!.segments[0]!.departure.iataCode;
      const destination = current!.segments.at(-1)!.arrival.iataCode;
      const alternatives = (
        await this.reservationSystem.findAlternatives(origin, destination, change.newDepartureDate, booking.internal.counts, fare)
      ).filter((alternative) => alternative.itineraryId !== fare.itineraryId);
      alternativesPerChange.push(
        alternatives.map((next) => ({ oldItineraryId: fare.itineraryId, cabinClass: fare.cabinClass, fareBrand: fare.fareBrand, next })),
      );
    }
    if (alternativesPerChange.some((alternatives) => alternatives.length === 0)) return [];

    const expiresAt = new Date(Date.now() + OFFER_TTL_MINUTES * 60_000);
    const result: DateChangeOfferDto[] = [];
    for (const replacements of combine(alternativesPerChange).slice(0, MAX_CHANGE_OFFERS)) {
      const pricing = await this.priceDifference(booking, replacements);
      const changeOfferId = randomUUID();
      await this.offers.save({
        id: changeOfferId,
        bookingId: booking.bookingId,
        expiresAt,
        payload: { replacements, totalToPayCents: pricing.totalToPayCents },
      });
      result.push({
        changeOfferId,
        expiresAt: expiresAt.toISOString(),
        segments: replacements.flatMap((replacement) => replacement.next.segments),
        priceDifference: pricing.dto,
      });
    }
    return result;
  }

  async confirm(booking: BookingRecord, request: DateChangeRequestDto): Promise<DateChangeResult> {
    assertConfirmed(booking);
    const offer = await this.offers.find(request.changeOfferId);
    if (!offer || offer.bookingId !== booking.bookingId) {
      throw new ProblemDetailsException({
        status: 409,
        code: 'VALIDATION_FAILED',
        title: 'La oferta de cambio no existe para esta reserva.',
        invalidParams: [{ name: 'changeOfferId', reason: 'unknown changeOfferId' }],
      });
    }
    if (offer.expiresAt.getTime() <= Date.now()) {
      throw new ProblemDetailsException({ status: 410, code: 'CHANGE_OFFER_EXPIRED', title: 'La oferta de cambio expiró; vuelva a buscar.' });
    }

    let pending = false;
    if (offer.payload.totalToPayCents > 0) {
      if (!request.payment) {
        throw new ProblemDetailsException({
          status: 409,
          code: 'PAYMENT_REFERENCE_INVALID',
          title: 'El cambio tiene un costo: se requiere una referencia de pago.',
          invalidParams: [{ name: 'payment.paymentReference', reason: 'required when totalToPay > 0' }],
        });
      }
      const verification = await this.payments.verify(
        request.payment.paymentReference,
        moneyFromCents(offer.payload.totalToPayCents, 0),
      );
      if (verification === 'INVALID' || verification === 'NOT_AUTHORIZED') throw paymentProblem(verification, 409);
      pending = verification === 'PENDING';
    }

    // Cupos de los nuevos vuelos antes de tocar la reserva.
    const seatCount = seatsRequired(booking.internal.counts);
    const reserved: Replacement[] = [];
    for (const replacement of offer.payload.replacements) {
      if (!(await this.reservationSystem.reserveInventory(replacement.next.segmentIds, replacement.cabinClass, seatCount))) {
        for (const done of reserved) await this.reservationSystem.releaseInventory(done.next.segmentIds, done.cabinClass, seatCount);
        throw new ProblemDetailsException({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE', title: 'Los nuevos vuelos ya no tienen cupo.' });
      }
      reserved.push(replacement);
    }

    const seatRequests = this.mapRequestedSeats(booking, offer.payload.replacements, request.assignedSeats ?? []);
    const cabinBySegment = new Map(
      offer.payload.replacements.flatMap((replacement) => replacement.next.segmentIds.map((id) => [id, replacement.cabinClass] as const)),
    );
    try {
      await this.seats.assign(booking.bookingId, seatRequests, cabinBySegment, 409);
    } catch (error) {
      for (const done of reserved) await this.reservationSystem.releaseInventory(done.next.segmentIds, done.cabinClass, seatCount);
      throw error;
    }

    await this.offers.delete(offer.id);
    if (request.payment) await this.payments.markUsed(request.payment.paymentReference, `date-change:${booking.bookingId}`);

    if (pending) {
      await this.bookingRepository.update(booking.bookingId, {
        status: 'CHANGE_PENDING',
        changes: [...(booking.changes ?? []), { changedAt: new Date().toISOString(), description: 'Cambio de fecha en proceso: pago pendiente.' }],
      });
      this.tasks.schedule(`date-change:${booking.bookingId}`, async () => {
        await this.apply(booking.bookingId, offer.payload, seatRequests);
      });
      return { statusCode: 202 };
    }

    return { statusCode: 200, body: toBookingDetail(await this.apply(booking.bookingId, offer.payload, seatRequests)) };
  }

  /** Reemplaza itinerarios, libera cupos/asientos/check-ins anteriores y reemite cupones. */
  private async apply(bookingId: string, payload: DateChangeOfferPayload, newSeats: SeatRequest[]): Promise<BookingRecord> {
    const booking = (await this.bookingRepository.findById(bookingId))!;
    const seatCount = seatsRequired(booking.internal.counts);
    const replacedSegments = new Set<string>();

    for (const replacement of payload.replacements) {
      const old = booking.internal.fares.find((fare) => fare.itineraryId === replacement.oldItineraryId)!;
      await this.reservationSystem.releaseInventory(old.segmentIds, old.cabinClass, seatCount);
      old.segmentIds.forEach((segmentId) => replacedSegments.add(segmentId));
    }

    for (const passenger of booking.passengers ?? []) {
      for (const seat of passenger.assignedSeats ?? []) {
        if (replacedSegments.has(seat.segmentId)) {
          await this.reservationSystem.releaseSeat(seat.segmentId, seat.seatNumber, seatHolder(bookingId, passenger.passengerId));
        }
      }
    }

    const passengers = structuredClone(booking.passengers ?? []).map((passenger) => {
      const kept = (passenger.assignedSeats ?? []).filter((seat) => !replacedSegments.has(seat.segmentId));
      const added = newSeats
        .filter((seat) => seat.passengerId === passenger.passengerId)
        .map(({ segmentId, seatNumber }) => ({ segmentId, seatNumber }));
      const extraBaggage = passenger.extraBaggage?.map((bag) => {
        const replacement = payload.replacements.find((candidate) => candidate.oldItineraryId === bag.itineraryId);
        return replacement ? { ...bag, itineraryId: replacement.next.itineraryId } : bag;
      });
      return { ...passenger, assignedSeats: [...kept, ...added], ...(extraBaggage ? { extraBaggage } : {}) };
    });

    const replace = <T extends { itineraryId: string }>(items: T[], map: (replacement: Replacement, item: T) => T): T[] =>
      items.map((item) => {
        const replacement = payload.replacements.find((candidate) => candidate.oldItineraryId === item.itineraryId);
        return replacement ? map(replacement, item) : item;
      });

    const fares: PurchasedFare[] = replace(booking.internal.fares, (replacement, fare) => ({
      ...fare,
      itineraryId: replacement.next.itineraryId,
      segmentIds: replacement.next.segmentIds,
      price: replacement.next.price,
    }));
    const itineraries = replace(booking.itineraries ?? [], (replacement) => replacement.next.itinerary);
    const allSegmentIds = fares.flatMap((fare) => fare.segmentIds);
    const checkIns = Object.fromEntries(
      Object.entries(booking.internal.checkIns).filter(([segmentId]) => !replacedSegments.has(segmentId)),
    );
    const now = new Date().toISOString();

    return this.bookingRepository.update(bookingId, {
      status: 'CONFIRMED',
      itineraries,
      passengers,
      tickets: (booking.tickets ?? []).map((ticket) => reissueCoupons(ticket, allSegmentIds, now)),
      grandTotal: sumMoney([booking.grandTotal, moneyFromCents(payload.totalToPayCents, 0)]),
      internal: { ...booking.internal, fares, checkIns },
      changes: [
        ...(booking.changes ?? []),
        {
          changedAt: now,
          description: `Cambio de fecha confirmado: ${payload.replacements
            .map((replacement) => `${replacement.oldItineraryId} → ${replacement.next.itineraryId}`)
            .join(', ')} (${formatCents(payload.totalToPayCents)} USD).`,
        },
      ],
    });
  }

  private async assertChangeable(fare: PurchasedFare): Promise<void> {
    if (await hasDeparted(fare, this.reservationSystem)) throw flightAlreadyDeparted();
    const conditions = await this.reservationSystem.fareConditions(fare.cabinClass, fare.fareBrand);
    if (!conditions?.isChangeable) {
      throw new ProblemDetailsException({
        status: 409,
        code: 'FARE_NOT_CHANGEABLE',
        title: `La tarifa ${fare.fareBrand} no admite cambios de fecha.`,
      });
    }
  }

  /**
   * Diferencias con signo (negativas si el nuevo vuelo es más barato) y cargo por cambio por pasajero
   * con asiento. `totalToPay` nunca es negativo: el saldo a favor no se reembolsa en un cambio.
   */
  private async priceDifference(booking: BookingRecord, replacements: Replacement[]) {
    let fareCents = 0;
    let taxCents = 0;
    let feeCents = 0;
    for (const replacement of replacements) {
      const old = booking.internal.fares.find((fare) => fare.itineraryId === replacement.oldItineraryId)!;
      fareCents += toCents(replacement.next.price.baseFare) - toCents(old.price.baseFare);
      taxCents += toCents(replacement.next.price.taxes) - toCents(old.price.taxes);
      const conditions = await this.reservationSystem.fareConditions(old.cabinClass, old.fareBrand);
      feeCents += (conditions?.changeFeeUsd ?? 0) * 100 * seatsRequired(booking.internal.counts);
    }
    const totalToPayCents = Math.max(0, fareCents + taxCents) + feeCents;
    return {
      totalToPayCents,
      dto: {
        fareDifference: formatCents(fareCents),
        taxDifference: formatCents(taxCents),
        changeFee: formatCents(feeCents),
        totalToPay: formatCents(totalToPayCents),
      },
    };
  }

  /**
   * `DateChangeRequest.assignedSeats` no indica el pasajero (HALL-21): los asientos de cada segmento
   * se asignan en orden a los pasajeros con asiento, según el orden de la reserva.
   */
  private mapRequestedSeats(
    booking: BookingRecord,
    replacements: Replacement[],
    requested: { segmentId?: string; seatNumber?: string }[],
  ): SeatRequest[] {
    const newSegments = new Set(replacements.flatMap((replacement) => replacement.next.segmentIds));
    const seated = (booking.passengers ?? []).filter((passenger) => passenger.passengerType !== 'INFANT');
    const usedPerSegment = new Map<string, number>();

    return requested.map((seat) => {
      if (!seat.segmentId || !seat.seatNumber || !newSegments.has(seat.segmentId)) {
        throw new ProblemDetailsException({
          status: 409,
          code: 'VALIDATION_FAILED',
          title: 'Los asientos deben indicar un segmento de los nuevos vuelos.',
          invalidParams: [{ name: 'assignedSeats', reason: 'segmentId must belong to the change offer' }],
        });
      }
      const index = usedPerSegment.get(seat.segmentId) ?? 0;
      const passenger = seated[index];
      if (!passenger) {
        throw new ProblemDetailsException({
          status: 409,
          code: 'VALIDATION_FAILED',
          title: 'Hay más asientos que pasajeros para el segmento.',
          invalidParams: [{ name: 'assignedSeats', reason: `too many seats for ${seat.segmentId}` }],
        });
      }
      usedPerSegment.set(seat.segmentId, index + 1);
      return { passengerId: passenger.passengerId, segmentId: seat.segmentId, seatNumber: seat.seatNumber };
    });
  }
}

/** Ida y vuelta: todas las combinaciones; más tramos: emparejadas por posición. */
function combine(options: Replacement[][]): Replacement[][] {
  if (options.length <= 2) {
    return options.reduce<Replacement[][]>(
      (combinations, list) => combinations.flatMap((combination) => list.map((option) => [...combination, option])),
      [[]],
    );
  }
  const size = Math.max(...options.map((list) => list.length));
  return Array.from({ length: size }, (_, index) => options.map((list) => list[index % list.length]!));
}
