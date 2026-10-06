import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { formatCents, toCents } from '@ecoairlines/data-access/common/money.js';
import { seatsRequired } from '@ecoairlines/data-access/common/passenger-counts.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import { seatHolder } from '../../common/seating/seat-assigner.js';
import { BookingsFacade, type BookingSnapshot } from '../bookings/bookings.facade.js';
import { assertConfirmed, hasDeparted } from '../../rules/post-sale/post-sale-rules.js';
import { POST_SALE_GDS_GATEWAY, type PostSaleGdsGateway } from '@ecoairlines/data-management/interfaces/post-sale/post-sale-gds.gateway.js';
import { CANCELLATION_QUOTE_REPOSITORY, type QuoteRepository } from '@ecoairlines/data-management/interfaces/post-sale/quote.repository.js';
import type { CancelBookingRequestDto, CancellationQuoteResponseDto } from '../../dto/post-sale/cancellation.dto.js';

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
 * Las cotizaciones son datos de post-sale (BD futura: `post-sale`); la cancelación de la reserva se
 * pide a bookings mediante `BookingsFacade`.
 */
@Injectable()
export class CancellationService {
  constructor(
    private readonly bookings: BookingsFacade,
    @Inject(POST_SALE_GDS_GATEWAY) private readonly gds: PostSaleGdsGateway,
    @Inject(CANCELLATION_QUOTE_REPOSITORY) private readonly quotes: QuoteRepository<CancellationQuotePayload>,
  ) {}

  async getQuote(booking: BookingSnapshot): Promise<CancellationQuoteResponseDto> {
    assertConfirmed(booking);

    let refundCents = 0;
    let penaltyCents = 0;
    let allRefundable = true;
    const unflownItineraryIds: string[] = [];
    for (const fare of booking.fares) {
      if (await hasDeparted(fare, this.gds)) continue;
      unflownItineraryIds.push(fare.itineraryId);
      const conditions = await this.gds.fareConditions(fare.cabinClass, fare.fareBrand);
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
  async cancel(booking: BookingSnapshot, request: CancelBookingRequestDto): Promise<void> {
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

    // Efectos en el sistema externo (GDS): liberar cupos y asientos de los vuelos no volados.
    const seatCount = seatsRequired(booking.counts);
    for (const fare of booking.fares.filter((candidate) => quote.payload.unflownItineraryIds.includes(candidate.itineraryId))) {
      await this.gds.releaseInventory(fare.segmentIds, fare.cabinClass, seatCount);
      for (const passenger of booking.passengers ?? []) {
        for (const seat of passenger.assignedSeats ?? []) {
          if (fare.segmentIds.includes(seat.segmentId)) {
            await this.gds.releaseSeat(seat.segmentId, seat.seatNumber, seatHolder(booking.bookingId, passenger.passengerId));
          }
        }
      }
    }

    await this.quotes.delete(quote.id);
    await this.bookings.cancel(booking.bookingId, {
      refunded: quote.payload.refundCents > 0,
      description:
        `Reserva cancelada (cotización ${quote.id}). Reembolso: ${formatCents(quote.payload.refundCents)} ${booking.grandTotal.currency}; ` +
        `penalidad: ${formatCents(quote.payload.penaltyCents)}.${request.reason ? ` Motivo: ${request.reason}` : ''}`,
    });
  }
}
