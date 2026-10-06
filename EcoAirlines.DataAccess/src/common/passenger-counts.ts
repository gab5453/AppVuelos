import type { PassengerType } from './contract/common.types.js';

/** `PassengerBreakdown` con los defaults del contrato ya aplicados (adults: 1, resto: 0). */
export interface PassengerCounts {
  adults: number;
  youths: number;
  children: number;
  infants: number;
}

export function resolvePassengerCounts(breakdown: Partial<PassengerCounts> | undefined): PassengerCounts {
  return {
    adults: breakdown?.adults ?? 1,
    youths: breakdown?.youths ?? 0,
    children: breakdown?.children ?? 0,
    infants: breakdown?.infants ?? 0,
  };
}

/** Los infantes viajan en el regazo de un adulto: no ocupan asiento. */
export function seatsRequired(counts: PassengerCounts): number {
  return counts.adults + counts.youths + counts.children;
}

export function countsByType(counts: PassengerCounts): [PassengerType, number][] {
  return (
    [
      ['ADULT', counts.adults],
      ['YOUTH', counts.youths],
      ['CHILD', counts.children],
      ['INFANT', counts.infants],
    ] as [PassengerType, number][]
  ).filter(([, count]) => count > 0);
}

export function countPassengers(passengers: { passengerType: PassengerType }[]): PassengerCounts {
  const count = (type: PassengerType) => passengers.filter((passenger) => passenger.passengerType === type).length;
  return { adults: count('ADULT'), youths: count('YOUTH'), children: count('CHILD'), infants: count('INFANT') };
}
