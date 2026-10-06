import { Inject, Injectable } from '@nestjs/common';
import type { BookingDetail } from '@ecoairlines/data-access/common/contract/booking.types.js';
import type { ItineraryOption, MoneyAmount, Ticket } from '@ecoairlines/data-access/common/contract/common.types.js';
import { sumMoney } from '@ecoairlines/data-access/common/money.js';
import type { PassengerCounts } from '@ecoairlines/data-access/common/passenger-counts.js';
import { reissueCoupons } from '../../rules/bookings/booking-records.js';
import type { BookingRecord, PurchasedFare } from '@ecoairlines/data-access/entities/bookings/booking.entity.js';
import { BOOKING_REPOSITORY, type BookingRepository } from '@ecoairlines/data-management/interfaces/bookings/booking.repository.js';

export type { PurchasedFare } from '@ecoairlines/data-access/entities/bookings/booking.entity.js';

/**
 * Vista de solo lectura de una reserva para OTROS dominios (post-sale, check-in).
 * Es una copia: modificarla no cambia la reserva. No incluye `ownerId` ni el hold de origen.
 */
export type BookingSnapshot = Readonly<BookingDetail> & {
  readonly fares: readonly PurchasedFare[];
  readonly counts: PassengerCounts;
};

export interface SeatAssignment {
  passengerId: string;
  segmentId: string;
  seatNumber: string;
}

export interface ItineraryReplacement {
  oldItineraryId: string;
  itineraryId: string;
  segmentIds: string[];
  /** Itinerario en forma de contrato, con la tarifa comprada. */
  itinerary: ItineraryOption;
  price: MoneyAmount;
}

export interface ItineraryChange {
  replacements: ItineraryReplacement[];
  /** Monto cobrado por el cambio (diferencia de tarifa + cargo); se suma al total de la reserva. */
  charge: MoneyAmount;
  /** Asientos elegidos en los nuevos segmentos. */
  newSeats: SeatAssignment[];
  description: string;
}

/**
 * **API pública del dominio bookings** (fachada). Es la única forma en que otros dominios leen o
 * modifican una reserva: el repositorio de reservas es privado de bookings.
 *
 * Cada operación es un comando de negocio que mantiene las reglas de la reserva en un solo lugar
 * (asientos del pasajero, reemisión de cupones, historial). Al separar en microservicios, cada método
 * pasa a ser un endpoint interno o un evento del servicio de reservas, sin cambiar a quien lo llama.
 */
@Injectable()
export class BookingsFacade {
  constructor(@Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository) {}

  /** Reserva del usuario, o `undefined` si no existe o es de otro (el llamador responde 404, evitando IDOR). */
  async findOwned(ownerId: string, bookingId: string): Promise<BookingSnapshot | undefined> {
    const record = await this.bookings.findById(bookingId);
    return record && record.ownerId === ownerId ? toSnapshot(record) : undefined;
  }

  /**
   * Todas las reservas, como copias de solo lectura, de la más reciente a la más antigua. Solo para el dominio
   * admin (indicadores y pasajeros por vuelo); el controller que lo usa exige el scope de administrador.
   */
  /**
   * Datos de la reserva para publicar un evento `booking.*`, incluido su dueño (`sub`): el bus entrega el evento solo a
   * las suscripciones de ese dueño. Es lo único que expone el dueño fuera del dominio bookings, y nunca sale en el payload.
   */
  async eventSubject(bookingId: string): Promise<{ bookingId: string; pnr: string; status: string; ownerId: string }> {
    const record = await this.bookings.findById(bookingId);
    if (!record) throw new Error(`Reserva ${bookingId} inexistente`);
    return { bookingId: record.bookingId, pnr: record.pnr, status: record.status, ownerId: record.ownerId };
  }

  async listAll(): Promise<BookingSnapshot[]> {
    return (await this.bookings.findAll())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toSnapshot);
  }

  /** Registra maletas extra pagadas (posventa): las suma al pasajero, al total y al historial. */
  async recordBaggagePurchase(
    bookingId: string,
    purchase: { passengerId: string; itineraryId: string; quantity: number; amount: MoneyAmount },
  ): Promise<BookingSnapshot> {
    const record = await this.require(bookingId);
    const passengers = structuredClone(record.passengers ?? []).map((passenger) => {
      if (passenger.passengerId !== purchase.passengerId) return passenger;
      const bags = passenger.extraBaggage ?? [];
      const existing = bags.find((bag) => bag.itineraryId === purchase.itineraryId);
      return {
        ...passenger,
        extraBaggage: existing
          ? bags.map((bag) => (bag === existing ? { ...bag, quantity: bag.quantity + purchase.quantity } : bag))
          : [...bags, { itineraryId: purchase.itineraryId, quantity: purchase.quantity }],
      };
    });
    return toSnapshot(
      await this.bookings.update(bookingId, {
        passengers,
        grandTotal: sumMoney([record.grandTotal, purchase.amount]),
        changes: withHistory(
          record,
          `${purchase.quantity} maleta(s) extra para ${purchase.passengerId} en ${purchase.itineraryId} (${purchase.amount.total} ${purchase.amount.currency}).`,
        ),
      }),
    );
  }

  /** Registra asientos asignados fuera de la reserva (p. ej. en el check-in) y deja constancia en el historial. */
  async recordSeatAssignments(bookingId: string, seats: SeatAssignment[], description: string): Promise<BookingSnapshot> {
    const record = await this.require(bookingId);
    const passengers = structuredClone(record.passengers ?? []).map((passenger) => {
      const mine = seats.filter((seat) => seat.passengerId === passenger.passengerId);
      if (mine.length === 0) return passenger;
      const kept = (passenger.assignedSeats ?? []).filter((seat) => !mine.some((added) => added.segmentId === seat.segmentId));
      return { ...passenger, assignedSeats: [...kept, ...mine.map(({ segmentId, seatNumber }) => ({ segmentId, seatNumber }))] };
    });
    return toSnapshot(await this.bookings.update(bookingId, { passengers, changes: withHistory(record, description) }));
  }

  /** Marca un cambio de fecha en proceso (pago pendiente). */
  async markChangePending(bookingId: string, description: string): Promise<void> {
    const record = await this.require(bookingId);
    await this.bookings.update(bookingId, { status: 'CHANGE_PENDING', changes: withHistory(record, description) });
  }

  /**
   * Aplica un cambio de itinerario: reemplaza itinerarios y tarifas, mueve los asientos y las maletas al
   * nuevo itinerario, reemite los cupones de los tickets y suma el cargo al total.
   */
  async applyItineraryChange(bookingId: string, change: ItineraryChange): Promise<BookingDetail> {
    const record = await this.require(bookingId);
    const replacedSegments = new Set(
      record.internal.fares
        .filter((fare) => change.replacements.some((replacement) => replacement.oldItineraryId === fare.itineraryId))
        .flatMap((fare) => fare.segmentIds),
    );
    const replacementFor = (itineraryId: string) =>
      change.replacements.find((replacement) => replacement.oldItineraryId === itineraryId);

    const passengers = structuredClone(record.passengers ?? []).map((passenger) => {
      const kept = (passenger.assignedSeats ?? []).filter((seat) => !replacedSegments.has(seat.segmentId));
      const added = change.newSeats
        .filter((seat) => seat.passengerId === passenger.passengerId)
        .map(({ segmentId, seatNumber }) => ({ segmentId, seatNumber }));
      const extraBaggage = passenger.extraBaggage?.map((bag) => {
        const replacement = replacementFor(bag.itineraryId);
        return replacement ? { ...bag, itineraryId: replacement.itineraryId } : bag;
      });
      return { ...passenger, assignedSeats: [...kept, ...added], ...(extraBaggage ? { extraBaggage } : {}) };
    });

    const fares: PurchasedFare[] = record.internal.fares.map((fare) => {
      const replacement = replacementFor(fare.itineraryId);
      return replacement
        ? { ...fare, itineraryId: replacement.itineraryId, segmentIds: replacement.segmentIds, price: replacement.price }
        : fare;
    });
    const itineraries = (record.itineraries ?? []).map(
      (itinerary) => replacementFor(itinerary.itineraryId)?.itinerary ?? itinerary,
    );
    const now = new Date().toISOString();
    const segmentIds = fares.flatMap((fare) => fare.segmentIds);

    const updated = await this.bookings.update(bookingId, {
      status: 'CONFIRMED',
      itineraries,
      passengers,
      tickets: (record.tickets ?? []).map((ticket: Ticket) => reissueCoupons(ticket, segmentIds, now)),
      grandTotal: sumMoney([record.grandTotal, change.charge]),
      internal: { ...record.internal, fares },
      changes: withHistory(record, change.description),
    });
    return toDetail(updated);
  }

  /** Cancela la reserva y marca sus tickets como reembolsados o anulados. */
  async cancel(bookingId: string, outcome: { refunded: boolean; description: string }): Promise<void> {
    const record = await this.require(bookingId);
    await this.bookings.update(bookingId, {
      status: 'CANCELLED',
      tickets: (record.tickets ?? []).map((ticket) => ({ ...ticket, status: outcome.refunded ? 'REFUNDED' : 'VOIDED' })),
      changes: withHistory(record, outcome.description),
    });
  }

  private async require(bookingId: string): Promise<BookingRecord> {
    const record = await this.bookings.findById(bookingId);
    if (!record) throw new Error(`BOOKING_NOT_FOUND: ${bookingId}`);
    return record;
  }
}

function withHistory(record: BookingRecord, description: string) {
  return [...(record.changes ?? []), { changedAt: new Date().toISOString(), description }];
}

function toSnapshot(record: BookingRecord): BookingSnapshot {
  const { ownerId: _ownerId, internal, ...detail } = structuredClone(record);
  return { ...detail, fares: internal.fares, counts: internal.counts };
}

/** BookingDetail del contrato a partir de un snapshot o un registro: sin datos internos. */
export function toDetail(source: BookingRecord | BookingSnapshot): BookingDetail {
  const {
    ownerId: _ownerId,
    internal: _internal,
    fares: _fares,
    counts: _counts,
    ...detail
  } = source as BookingRecord & Partial<BookingSnapshot>;
  return structuredClone(detail);
}
