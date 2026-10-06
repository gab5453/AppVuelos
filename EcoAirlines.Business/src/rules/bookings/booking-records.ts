import { randomInt } from 'node:crypto';
import type { Ticket } from '@ecoairlines/data-access/common/contract/common.types.js';

const PNR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Prefijo de 3 dígitos de los e-tickets. Ficticio, como el código de aerolínea (HALL-10). */
const TICKET_PREFIX = '999';

/** Localizador de 6 caracteres sin caracteres ambiguos (0/O, 1/I). */
export function generatePnr(): string {
  return Array.from({ length: 6 }, () => PNR_ALPHABET[randomInt(PNR_ALPHABET.length)]).join('');
}

function eTicketNumber(): string {
  return `${TICKET_PREFIX}${String(randomInt(10_000_000_000)).padStart(10, '0')}`;
}

/** Un ticket por pasajero (incluidos infantes), con un cupón por segmento. */
export function buildTickets(
  bookingId: string,
  passengerIds: string[],
  segmentIds: string[],
  issued: boolean,
  now: string,
): Ticket[] {
  return passengerIds.map((passengerId, index) => ({
    ticketId: `TKT-${bookingId.slice(0, 8).toUpperCase()}-${index + 1}`,
    bookingId,
    passengerId,
    eTicketNumber: issued ? eTicketNumber() : null,
    status: issued ? 'ISSUED' : 'PENDING',
    issuedAt: issued ? now : null,
    segments: segmentIds.map((segmentId, couponIndex) => ({
      segmentId,
      status: issued ? 'ISSUED' : 'PENDING',
      couponNumber: issued ? String(couponIndex + 1) : null,
    })),
    failureReason: null,
  }));
}

/** Completa la emisión de tickets pendientes (flujo asíncrono). */
export function issuePendingTickets(tickets: Ticket[], now: string): Ticket[] {
  return tickets.map((ticket) =>
    ticket.status !== 'PENDING' && ticket.status !== 'ISSUING'
      ? ticket
      : {
          ...ticket,
          eTicketNumber: eTicketNumber(),
          status: 'ISSUED',
          issuedAt: now,
          segments: (ticket.segments ?? []).map((segment, index) => ({
            ...segment,
            status: 'ISSUED',
            couponNumber: String(index + 1),
          })),
        },
  );
}

/** Reemite los cupones de un ticket tras un cambio de itinerario. */
export function reissueCoupons(ticket: Ticket, segmentIds: string[], now: string): Ticket {
  return {
    ...ticket,
    issuedAt: now,
    segments: segmentIds.map((segmentId, index) => ({ segmentId, status: 'ISSUED', couponNumber: String(index + 1) })),
  };
}
