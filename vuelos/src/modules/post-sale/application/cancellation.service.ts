import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { formatCents, toCents } from '../../../common/money/money.js';
import { seatsRequired } from '../../../common/passengers/passenger-counts.js';
import { ProblemDetailsException } from '../../../common/problem-details/problem-details.exception.js';
import { seatHolder } from '../../bookings/application/seat-assignment.service.js';
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRecord,
  type BookingRepositoryPort,
} from '../../bookings/domain/ports/booking-repository.port.js';
import { RESERVATION_SYSTEM_PORT, type ReservationSystemPort } from '../../bookings/domain/ports/reservation-system.port.js';
import { assertConfirmed, hasDeparted } from '../domain/post-sale-rules.js';
import { CANCELLATION_QUOTE_STORE, type QuoteStorePort } from '../domain/ports/quote-store.port.js';
import type { CancelBookingRequestDto, CancellationQuoteResponseDto } from '../presentation/dto/cancellation.dto.js';

const QUOTE_TTL_MINUTES = 15;

export interface CancellationQuotePayload {
  refundCents: number;
  penaltyCents: number;
  /** Itinerarios aún no volados cuyo inventario se libera al cancelar. */
  unflownItineraryIds: string[];
}

/**
 * Cotización: por cada itinerario no volado, una tarifa reembolsable devuelve su total; una no
 * reembolsable devuelve solo los impuestos y la tarifa base queda como penalidad. Las maletas extra
 * no se reembolsan. El reembolso financiero lo ejecuta la Payment API; aquí solo se registra.
 */
@Injectable()
export class CancellationService {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT) private readonly bookingRepository: BookingRepositoryPort,
    @Inject(RESERVATION_SYSTEM_PORT) private readonly reservationSystem: ReservationSystemPort,
    @Inject(CANCELLATION_QUOTE_STORE) private readonly quotes: QuoteStorePort<CancellationQuotePayload>,
  ) {}

  async getQuote(booking: BookingRecord): Promise<CancellationQuoteResponseDto> {
    assertConfirmed(booking);

    let refundCents = 0;
    let penaltyCents = 0;
    let allRefundable = true;
    const unflownItineraryIds: string[] = [];
    for (const fare of booking.internal.fares) {
      if (await hasDeparted(fare, this.reservationSystem)) continue;
      unflownItineraryIds.push(fare.itineraryId);
      const conditions = await this.reservationSystem.fareConditions(fare.cabinClass, fare.fareBrand);
      if (conditions?.isRefundable) {
        refundCents += toCents(fare.price.total);
      } else {
        allRefundable = false;
        refundCents += toCents(fare.price.taxes);
        penaltyCents += toCents(fare.price.baseFare);
      }
    }

    const quoteId = randomUUID();
    const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60_000);
    await this.quotes.save({ id: quoteId, bookingId: booking.bookingId, expiresAt, payload: { refundCents, penaltyCents, unflownItineraryIds } });

    return {
      quoteId,
      isRefundable: allRefundable && unflownItineraryIds.length > 0,
      refundAmount: formatCents(refundCents),
      penaltyAmount: formatCents(penaltyCents),
      currency: booking.grandTotal.currency,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** `POST /cancel` solo documenta 409 como error: una cotización desconocida o vencida responde 409 (HALL-18). */
  async cancel(booking: BookingRecord, request: CancelBookingRequestDto): Promise<void> {
    assertConfirmed(booking);

    const quote = await this.quotes.find(request.quoteId);
    if (!quote || quote.bookingId !== booking.bookingId) {
      throw new ProblemDetailsException({
        status: 409,
        code: 'VALIDATION_FAILED',
        title: 'La cotización de cancelación no existe para esta reserva.',
        invalidParams: [{ name: 'quoteId', reason: 'unknown quoteId' }],
      });
    }
    if (quote.expiresAt.getTime() <= Date.now()) {
      throw new ProblemDetailsException({ status: 409, code: 'QUOTE_EXPIRED', title: 'La cotización expiró; solicite una nueva.' });
    }

    const seatCount = seatsRequired(booking.internal.counts);
    for (const fare of booking.internal.fares.filter((candidate) => quote.payload.unflownItineraryIds.includes(candidate.itineraryId))) {
      await this.reservationSystem.releaseInventory(fare.segmentIds, fare.cabinClass, seatCount);
      for (const passenger of booking.passengers ?? []) {
        for (const seat of passenger.assignedSeats ?? []) {
          if (fare.segmentIds.includes(seat.segmentId)) {
            await this.reservationSystem.releaseSeat(seat.segmentId, seat.seatNumber, seatHolder(booking.bookingId, passenger.passengerId));
          }
        }
      }
    }

    await this.quotes.delete(quote.id);
    const refunded = quote.payload.refundCents > 0;
    const now = new Date().toISOString();
    await this.bookingRepository.update(booking.bookingId, {
      status: 'CANCELLED',
      tickets: (booking.tickets ?? []).map((ticket) => ({ ...ticket, status: refunded ? 'REFUNDED' : 'VOIDED' })),
      changes: [
        ...(booking.changes ?? []),
        {
          changedAt: now,
          description:
            `Reserva cancelada (cotización ${quote.id}). Reembolso: ${formatCents(quote.payload.refundCents)} ${booking.grandTotal.currency}; ` +
            `penalidad: ${formatCents(quote.payload.penaltyCents)}.${request.reason ? ` Motivo: ${request.reason}` : ''}`,
        },
      ],
    });
  }
}
