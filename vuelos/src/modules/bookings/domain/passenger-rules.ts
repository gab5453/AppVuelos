import type { PassengerItem } from '../../../common/contract-types/common.types.js';
import { countPassengers, type PassengerCounts } from '../../../common/passengers/passenger-counts.js';
import type { ProblemDetailsCode } from '../../../common/problem-details/problem-details.types.js';
import { ProblemDetailsException } from '../../../common/problem-details/problem-details.exception.js';
import { MAX_EXTRA_BAGS } from '../../../common/policies/commercial-policy.js';

function unprocessable(code: ProblemDetailsCode, title: string, name: string, reason: string): ProblemDetailsException {
  return new ProblemDetailsException({ status: 422, code, title, invalidParams: [{ name, reason }] });
}

/**
 * Reglas de negocio de los pasajeros de una reserva frente al hold (422 del contrato):
 * ids únicos, mismos tipos y cantidades que el hold, infantes asociados a un adulto distinto
 * y sin asiento, maletas extra válidas y asientos solo en segmentos del itinerario.
 */
export function assertPassengersMatchHold(
  passengers: PassengerItem[],
  counts: PassengerCounts,
  itineraryIds: string[],
  segmentIds: string[],
): void {
  const ids = passengers.map((passenger) => passenger.passengerId);
  if (new Set(ids).size !== ids.length) {
    throw unprocessable('VALIDATION_FAILED', 'Los passengerId deben ser únicos.', 'passengers', 'duplicated passengerId');
  }

  const provided = countPassengers(passengers);
  if (
    provided.adults !== counts.adults ||
    provided.youths !== counts.youths ||
    provided.children !== counts.children ||
    provided.infants !== counts.infants
  ) {
    throw unprocessable(
      'VALIDATION_FAILED',
      'Los pasajeros no coinciden con los retenidos en el hold.',
      'passengers',
      `expected adults=${counts.adults}, youths=${counts.youths}, children=${counts.children}, infants=${counts.infants}`,
    );
  }

  const adultIds = new Set(passengers.filter((p) => p.passengerType === 'ADULT').map((p) => p.passengerId));
  const adultsWithInfant = new Set<string>();

  passengers.forEach((passenger, index) => {
    const path = `passengers[${index}]`;

    if (passenger.passengerType === 'INFANT') {
      if (!passenger.associatedAdultId || !adultIds.has(passenger.associatedAdultId)) {
        throw unprocessable('VALIDATION_FAILED', 'Cada infante debe asociarse a un adulto de la reserva.', `${path}.associatedAdultId`, 'must reference an ADULT passengerId');
      }
      if (adultsWithInfant.has(passenger.associatedAdultId)) {
        throw unprocessable('VALIDATION_FAILED', 'Un adulto solo puede viajar con un infante.', `${path}.associatedAdultId`, 'adult already has an infant');
      }
      adultsWithInfant.add(passenger.associatedAdultId);
      if (passenger.assignedSeats?.length) {
        throw unprocessable('INFANT_SEAT_NOT_ALLOWED', 'Los infantes viajan en el regazo de un adulto y no tienen asiento.', `${path}.assignedSeats`, 'not allowed for INFANT');
      }
    } else if (passenger.associatedAdultId !== undefined) {
      throw unprocessable('VALIDATION_FAILED', 'Solo los infantes pueden tener associatedAdultId.', `${path}.associatedAdultId`, 'only allowed for INFANT');
    }

    const bagsByItinerary = new Map<string, number>();
    for (const bag of passenger.extraBaggage ?? []) {
      if (!itineraryIds.includes(bag.itineraryId)) {
        throw unprocessable('VALIDATION_FAILED', 'La maleta extra referencia un itinerario que no está en la reserva.', `${path}.extraBaggage`, `unknown itineraryId ${bag.itineraryId}`);
      }
      if (bag.quantity < 1) {
        throw unprocessable('VALIDATION_FAILED', 'La cantidad de maletas extra debe ser al menos 1.', `${path}.extraBaggage`, 'quantity must be >= 1');
      }
      bagsByItinerary.set(bag.itineraryId, (bagsByItinerary.get(bag.itineraryId) ?? 0) + bag.quantity);
    }
    if ([...bagsByItinerary.values()].some((total) => total > MAX_EXTRA_BAGS)) {
      throw unprocessable('BAGGAGE_LIMIT_EXCEEDED', `Máximo ${MAX_EXTRA_BAGS} maletas extra por pasajero e itinerario.`, `${path}.extraBaggage`, `max ${MAX_EXTRA_BAGS}`);
    }

    const seatSegments = (passenger.assignedSeats ?? []).map((seat) => seat.segmentId);
    if (seatSegments.some((segmentId) => !segmentIds.includes(segmentId))) {
      throw unprocessable('VALIDATION_FAILED', 'El asiento referencia un segmento que no está en la reserva.', `${path}.assignedSeats`, 'unknown segmentId');
    }
    if (new Set(seatSegments).size !== seatSegments.length) {
      throw unprocessable('VALIDATION_FAILED', 'Solo se permite un asiento por pasajero y segmento.', `${path}.assignedSeats`, 'duplicated segmentId');
    }
  });
}
