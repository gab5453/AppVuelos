import { Inject, Injectable } from '@nestjs/common';
import { DomainEventBus } from '../../common/events/domain-event-bus.js';
import { randomUUID } from 'node:crypto';
import type { MoneyAmount, PassengerItem } from '@ecoairlines/data-access/common/contract/common.types.js';
import { moneyFromCents, scaleMoney, sumMoney } from '@ecoairlines/data-access/common/money.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import { DeferredTaskRunner } from '../../common/scheduling/deferred-task-runner.js';
import { paymentProblem } from '../../common/payments/payment-problem.js';
import { SeatAssigner } from '../../common/seating/seat-assigner.js';
import { buildTickets, generatePnr, issuePendingTickets } from '../../rules/bookings/booking-records.js';
import { assertPassengersMatchHold } from '../../rules/bookings/passenger-rules.js';
import { assertPassengerIdentities, identityKey, travelDates } from '../../rules/bookings/passenger-identity-rules.js';
import type { BookingRecord } from '@ecoairlines/data-access/entities/bookings/booking.entity.js';
import { BOOKING_REPOSITORY, type BookingRepository } from '@ecoairlines/data-management/interfaces/bookings/booking.repository.js';
import { HOLD_GATEWAY_PORT, type HoldGatewayPort, type HoldLookup } from './hold-gateway.port.js';
import { PAYMENT_VERIFIER_GATEWAY, type PaymentVerifierGateway } from '@ecoairlines/data-management/interfaces/bookings/payment-verifier.gateway.js';
import { RESERVATION_SYSTEM_GATEWAY, type ReservationSystemGateway } from '@ecoairlines/data-management/interfaces/bookings/reservation-system.gateway.js';
import { toDetail, type BookingSnapshot } from './bookings.facade.js';
import type { BookingRequestDto } from '../../dto/bookings/booking-request.dto.js';
import type {
  BookingDetailDto,
  BookingListItemDto,
  BookingListResponseDto,
  TicketListResponseDto,
} from '../../dto/bookings/booking-detail.dto.js';
import type { ListBookingsQueryDto } from '../../dto/bookings/list-bookings-query.dto.js';

export interface BookingCreationResult {
  /** 201: reserva creada y tickets emitidos. 202: el pago o la emisión continúan de forma asíncrona. */
  statusCode: 201 | 202;
  booking: BookingDetailDto;
}

@Injectable()
export class BookingsService {
  private readonly seats: SeatAssigner;

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepository: BookingRepository,
    @Inject(HOLD_GATEWAY_PORT) private readonly holds: HoldGatewayPort,
    @Inject(PAYMENT_VERIFIER_GATEWAY) private readonly payments: PaymentVerifierGateway,
    @Inject(RESERVATION_SYSTEM_GATEWAY) private readonly reservationSystem: ReservationSystemGateway,
    private readonly tasks: DeferredTaskRunner,
    private readonly events: DomainEventBus,
  ) {
    this.seats = new SeatAssigner(reservationSystem);
  }

  /**
   * Orden: validar hold y pasajeros → cotizar maletas → verificar pago → asignar asientos →
   * consumir el hold. Nada se consume ni se asigna si una validación previa falla.
   */
  async create(ownerId: string, request: BookingRequestDto): Promise<BookingCreationResult> {
    const lookup = await this.holds.getHeld(ownerId, request.holdId);
    if (!lookup.ok) throw holdProblem(lookup.reason);
    const { hold } = lookup;

    const passengers = JSON.parse(JSON.stringify(request.passengers)) as PassengerItem[];
    const segmentIds = hold.selections.flatMap((selection) => selection.segmentIds);
    assertPassengersMatchHold(
      passengers,
      hold.counts,
      hold.selections.map((selection) => selection.itineraryId),
      segmentIds,
    );
    assertPassengerIdentities(passengers, travelDates(segmentIds));
    await this.assertNotAlreadyOnFlight(passengers, segmentIds);

    const grandTotal = sumMoney([hold.lockedPrice, await this.extraBaggageCost(passengers)]);

    const verification = await this.payments.verify(request.payment.paymentReference, grandTotal);
    if (verification === 'INVALID' || verification === 'NOT_AUTHORIZED') {
      throw paymentProblem(verification, 422);
    }

    const bookingId = randomUUID();
    const cabinBySegment = new Map(
      hold.selections.flatMap((selection) => selection.segmentIds.map((segmentId) => [segmentId, selection.cabinClass] as const)),
    );
    const seatRequests = passengers.flatMap((passenger) =>
      (passenger.assignedSeats ?? []).map((seat) => ({ passengerId: passenger.passengerId, ...seat })),
    );
    await this.seats.assign(bookingId, seatRequests, cabinBySegment, 422);

    const consumed = await this.holds.consume(ownerId, request.holdId);
    if (!consumed.ok) {
      await this.seats.release(bookingId, seatRequests);
      throw holdProblem(consumed.reason);
    }
    await this.payments.markUsed(request.payment.paymentReference, `booking:${bookingId}`);

    const issued = verification === 'AUTHORIZED';
    const now = new Date().toISOString();
    const record = await this.bookingRepository.create({
      bookingId,
      ownerId,
      pnr: await this.uniquePnr(),
      status: issued ? 'CONFIRMED' : 'PENDING_PAYMENT',
      grandTotal,
      createdAt: now,
      updatedAt: now,
      itineraries: hold.selections.map((selection) => selection.itinerary),
      passengers,
      tickets: buildTickets(bookingId, passengers.map((p) => p.passengerId), segmentIds, issued, now),
      changes: [
        { changedAt: now, description: `Reserva creada desde el hold ${hold.holdId}.` },
        {
          changedAt: now,
          description: issued ? 'Pago verificado y tickets emitidos.' : 'Pago en proceso: la emisión de tickets continúa de forma asíncrona.',
        },
      ],
      internal: {
        holdId: hold.holdId,
        counts: hold.counts,
        fares: hold.selections.map(({ itineraryId, cabinClass, fareBrand, segmentIds: ids, price }) => ({
          itineraryId,
          cabinClass,
          fareBrand,
          segmentIds: ids,
          price,
        })),
      },
    });

    if (issued) {
      this.events.publishBooking('booking.confirmed', record);
      this.events.publishBooking('booking.ticket_issued', record, { tickets: record.tickets?.length ?? 0 });
    } else {
      this.events.publishBooking('booking.ticket_issuing', record);
      this.tasks.schedule(`ticket-issuance:${bookingId}`, () => this.completeIssuance(bookingId));
    }
    return { statusCode: issued ? 201 : 202, booking: toDetail(record) };
  }

  /** Filtros del contrato (`pnr`, `status`, `createdFrom`, `createdTo`) y paginación por cursor opaco. */
  async list(ownerId: string, query: ListBookingsQueryDto): Promise<BookingListResponseDto> {
    const offset = decodeCursor(query.cursor);
    const limit = query.limit ?? 10;

    const matching = (await this.bookingRepository.findAllByOwner(ownerId))
      .filter((booking) => !query.pnr || booking.pnr === query.pnr.toUpperCase())
      .filter((booking) => !query.status || booking.status === query.status)
      .filter((booking) => !query.createdFrom || booking.createdAt.slice(0, 10) >= query.createdFrom)
      .filter((booking) => !query.createdTo || booking.createdAt.slice(0, 10) <= query.createdTo)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.bookingId.localeCompare(b.bookingId));

    const page = matching.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      items: page.map(toListItem),
      ...(nextOffset < matching.length ? { nextCursor: encodeCursor(nextOffset) } : {}),
    };
  }

  /** La reserva ya fue resuelta y verificada como propia por BookingOwnershipGuard. */
  getDetail(booking: BookingSnapshot): BookingDetailDto {
    return toDetail(booking);
  }

  listTickets(booking: BookingSnapshot): TicketListResponseDto {
    return { bookingId: booking.bookingId, tickets: [...(booking.tickets ?? [])] };
  }

  getTicket(booking: BookingSnapshot, ticketId: string) {
    const ticket = booking.tickets?.find((t) => t.ticketId === ticketId);
    if (!ticket) {
      throw ProblemDetailsException.notFound('Ticket no encontrado.');
    }
    return ticket;
  }

  private async completeIssuance(bookingId: string): Promise<void> {
    const record = await this.bookingRepository.findById(bookingId);
    if (!record || record.status !== 'PENDING_PAYMENT') return;
    const now = new Date().toISOString();
    const updated = await this.bookingRepository.update(bookingId, {
      status: 'CONFIRMED',
      tickets: issuePendingTickets(record.tickets ?? [], now),
      changes: [...(record.changes ?? []), { changedAt: now, description: 'Pago confirmado y tickets emitidos.' }],
    });
    this.events.publishBooking('booking.confirmed', updated);
    this.events.publishBooking('booking.ticket_issued', updated, { tickets: updated.tickets?.length ?? 0 });
  }

  /**
   * Una persona (mismo país y número de documento) no puede estar dos veces en el mismo vuelo, aunque sea en otra reserva.
   * Las reservas canceladas o fallidas no cuentan. 422 VALIDATION_FAILED.
   */
  private async assertNotAlreadyOnFlight(passengers: PassengerItem[], segmentIds: string[]): Promise<void> {
    const wanted = new Map(passengers.map((passenger, index) => [identityKey(passenger), index]));
    const segments = new Set(segmentIds);
    for (const booking of await this.bookingRepository.findAll()) {
      if (booking.status === 'CANCELLED' || booking.status === 'FAILED') continue;
      const shared = booking.internal.fares.flatMap((fare) => fare.segmentIds).find((segmentId) => segments.has(segmentId));
      if (!shared) continue;
      for (const existing of booking.passengers ?? []) {
        const index = wanted.get(identityKey(existing));
        if (index === undefined) continue;
        throw new ProblemDetailsException({
          status: 422,
          code: 'VALIDATION_FAILED',
          title: `El pasajero ${index + 1} ya tiene una reserva en el vuelo ${shared.split('-')[0]} con el mismo documento.`,
          invalidParams: [{ name: `passengers[${index}].documentNumber`, reason: `already booked on ${shared}` }],
        });
      }
    }
  }

  private async extraBaggageCost(passengers: PassengerItem[]): Promise<MoneyAmount> {
    const costs: MoneyAmount[] = [moneyFromCents(0, 0)];
    for (const bag of passengers.flatMap((passenger) => passenger.extraBaggage ?? [])) {
      const price = await this.reservationSystem.extraBagPrice(bag.itineraryId);
      if (price) costs.push(scaleMoney(price, bag.quantity));
    }
    return sumMoney(costs);
  }

  private async uniquePnr(): Promise<string> {
    for (;;) {
      const pnr = generatePnr();
      if (!(await this.bookingRepository.findByPnr(pnr))) return pnr;
    }
  }
}

/** `POST /bookings` documenta 409, 410 y 422 (no 404): un hold inexistente o ajeno es una entidad no procesable. */
function holdProblem(reason: Exclude<HoldLookup, { ok: true }>['reason']): ProblemDetailsException {
  switch (reason) {
    case 'NOT_FOUND':
      return new ProblemDetailsException({
        status: 422,
        code: 'VALIDATION_FAILED',
        title: 'El hold no existe o no pertenece al usuario.',
        invalidParams: [{ name: 'holdId', reason: 'unknown hold' }],
      });
    case 'EXPIRED':
      return new ProblemDetailsException({ status: 410, code: 'OFFER_NO_LONGER_AVAILABLE', title: 'El hold expiró; vuelva a buscar y retener la oferta.' });
    case 'NOT_HELD':
      return new ProblemDetailsException({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE', title: 'El hold ya fue utilizado o liberado.' });
  }
}

function toListItem(booking: BookingRecord): BookingListItemDto {
  const firstItinerary = booking.itineraries?.[0];
  const firstSegment = firstItinerary?.segments[0];
  const lastSegment = firstItinerary?.segments.at(-1);
  return {
    bookingId: booking.bookingId,
    pnr: booking.pnr,
    status: booking.status,
    ...(firstSegment ? { origin: firstSegment.departure.iataCode, departureDate: firstSegment.departure.at.slice(0, 10) } : {}),
    ...(lastSegment ? { destination: lastSegment.arrival.iataCode } : {}),
    grandTotal: booking.grandTotal,
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const { offset } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };
    if (typeof offset === 'number' && Number.isInteger(offset) && offset >= 0) return offset;
  } catch {
    // cursor malformado: se responde 400 abajo
  }
  throw new ProblemDetailsException({
    status: 400,
    code: 'VALIDATION_FAILED',
    title: 'El cursor de paginación no es válido.',
    invalidParams: [{ name: 'cursor', reason: 'invalid cursor' }],
  });
}
