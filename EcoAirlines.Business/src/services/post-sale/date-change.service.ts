import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BookingDetail } from '@ecoairlines/data-access/common/contract/booking.types.js';
import { formatCents, moneyFromCents, toCents } from '@ecoairlines/data-access/common/money.js';
import { seatsRequired } from '@ecoairlines/data-access/common/passenger-counts.js';
import { paymentProblem } from '../../common/payments/payment-problem.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import { DeferredTaskRunner } from '../../common/scheduling/deferred-task-runner.js';
import { SeatAssigner, seatHolder, type SeatRequest } from '../../common/seating/seat-assigner.js';
import { BookingsFacade, type BookingSnapshot, type PurchasedFare } from '../bookings/bookings.facade.js';
import { assertConfirmed, findFare, flightAlreadyDeparted, hasDeparted } from '../../rules/post-sale/post-sale-rules.js';
import { POST_SALE_GDS_GATEWAY, type PostSaleGdsGateway, type PricedItinerary } from '@ecoairlines/data-management/interfaces/post-sale/post-sale-gds.gateway.js';
import { POST_SALE_PAYMENT_GATEWAY, type PostSalePaymentGateway } from '@ecoairlines/data-management/interfaces/post-sale/post-sale-payment.gateway.js';
import { DATE_CHANGE_OFFER_REPOSITORY, type QuoteRepository } from '@ecoairlines/data-management/interfaces/post-sale/quote.repository.js';
import type {
  DateChangeOfferDto,
  DateChangeRequestDto,
  DateChangeSearchRequestDto,
  DateChangeSearchResponseDto,
} from '../../dto/post-sale/date-change.dto.js';

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

/**
 * Cambio de fecha. Las ofertas de cambio son datos de post-sale (BD futura: `post-sale`). Post-sale
 * gestiona el GDS (cupos y asientos de los vuelos viejos y nuevos); la reserva la modifica bookings
 * mediante `BookingsFacade.applyItineraryChange`.
 */
@Injectable()
export class DateChangeService {
  private readonly seats: SeatAssigner;

  constructor(
    private readonly bookings: BookingsFacade,
    @Inject(POST_SALE_GDS_GATEWAY) private readonly gds: PostSaleGdsGateway,
    @Inject(POST_SALE_PAYMENT_GATEWAY) private readonly payments: PostSalePaymentGateway,
    @Inject(DATE_CHANGE_OFFER_REPOSITORY) private readonly offers: QuoteRepository<DateChangeOfferPayload>,
    private readonly tasks: DeferredTaskRunner,
  ) {
    this.seats = new SeatAssigner(gds);
  }

  async search(booking: BookingSnapshot, request: DateChangeSearchRequestDto): Promise<DateChangeSearchResponseDto> {
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
        await this.gds.findAlternatives(origin, destination, change.newDepartureDate, booking.counts, fare)
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

  async confirm(booking: BookingSnapshot, request: DateChangeRequestDto): Promise<DateChangeResult> {
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
    const seatCount = seatsRequired(booking.counts);
    const reserved: Replacement[] = [];
    for (const replacement of offer.payload.replacements) {
      if (!(await this.gds.reserveInventory(replacement.next.segmentIds, replacement.cabinClass, seatCount))) {
        for (const done of reserved) await this.gds.releaseInventory(done.next.segmentIds, done.cabinClass, seatCount);
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
      for (const done of reserved) await this.gds.releaseInventory(done.next.segmentIds, done.cabinClass, seatCount);
      throw error;
    }

    await this.offers.delete(offer.id);
    if (request.payment) await this.payments.markUsed(request.payment.paymentReference, `date-change:${booking.bookingId}`);

    if (pending) {
      await this.bookings.markChangePending(booking.bookingId, 'Cambio de fecha en proceso: pago pendiente.');
      this.tasks.schedule(`date-change:${booking.bookingId}`, async () => {
        await this.apply(booking, offer.payload, seatRequests);
      });
      return { statusCode: 202 };
    }

    return { statusCode: 200, body: await this.apply(booking, offer.payload, seatRequests) };
  }

  /** Libera en el GDS los cupos y asientos de los vuelos reemplazados y pide a bookings aplicar el cambio. */
  private async apply(booking: BookingSnapshot, payload: DateChangeOfferPayload, newSeats: SeatRequest[]): Promise<BookingDetail> {
    const seatCount = seatsRequired(booking.counts);
    const replacedSegments = new Set<string>();

    for (const replacement of payload.replacements) {
      const old = booking.fares.find((fare) => fare.itineraryId === replacement.oldItineraryId)!;
      await this.gds.releaseInventory(old.segmentIds, old.cabinClass, seatCount);
      old.segmentIds.forEach((segmentId) => replacedSegments.add(segmentId));
    }

    for (const passenger of booking.passengers ?? []) {
      for (const seat of passenger.assignedSeats ?? []) {
        if (replacedSegments.has(seat.segmentId)) {
          await this.gds.releaseSeat(seat.segmentId, seat.seatNumber, seatHolder(booking.bookingId, passenger.passengerId));
        }
      }
    }

    return this.bookings.applyItineraryChange(booking.bookingId, {
      replacements: payload.replacements.map((replacement) => ({
        oldItineraryId: replacement.oldItineraryId,
        itineraryId: replacement.next.itineraryId,
        segmentIds: replacement.next.segmentIds,
        itinerary: replacement.next.itinerary,
        price: replacement.next.price,
      })),
      charge: moneyFromCents(payload.totalToPayCents, 0),
      newSeats,
      description: `Cambio de fecha confirmado: ${payload.replacements
        .map((replacement) => `${replacement.oldItineraryId} → ${replacement.next.itineraryId}`)
        .join(', ')} (${formatCents(payload.totalToPayCents)} USD).`,
    });
  }

  private async assertChangeable(fare: PurchasedFare): Promise<void> {
    if (await hasDeparted(fare, this.gds)) throw flightAlreadyDeparted();
    const conditions = await this.gds.fareConditions(fare.cabinClass, fare.fareBrand);
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
  private async priceDifference(booking: BookingSnapshot, replacements: Replacement[]) {
    let fareCents = 0;
    let taxCents = 0;
    let feeCents = 0;
    for (const replacement of replacements) {
      const old = booking.fares.find((fare) => fare.itineraryId === replacement.oldItineraryId)!;
      fareCents += toCents(replacement.next.price.baseFare) - toCents(old.price.baseFare);
      taxCents += toCents(replacement.next.price.taxes) - toCents(old.price.taxes);
      const conditions = await this.gds.fareConditions(old.cabinClass, old.fareBrand);
      feeCents += (conditions?.changeFeeUsd ?? 0) * 100 * seatsRequired(booking.counts);
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
    booking: BookingSnapshot,
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
