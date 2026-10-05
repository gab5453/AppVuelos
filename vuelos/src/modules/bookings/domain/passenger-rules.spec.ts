import type { PassengerItem } from '../../../common/contract-types/common.types.js';
import { assertPassengersMatchHold } from './passenger-rules.js';

const counts = { adults: 1, youths: 0, children: 0, infants: 1 };
const itineraries = ['EA300-20261201'];
const segments = ['EA300-20261201'];

function person(passengerId: string, passengerType: PassengerItem['passengerType'], extra: Partial<PassengerItem> = {}): PassengerItem {
  return {
    passengerId,
    passengerType,
    firstName: 'A',
    lastName: 'B',
    documentType: 'PASSPORT',
    documentNumber: '1',
    nationality: 'EC',
    birthDate: '1990-01-01',
    gender: 'F',
    contact: { email: 'a@b.c', phone: '1' },
    ...extra,
  };
}

function check(passengers: PassengerItem[], expectedCounts = counts) {
  try {
    assertPassengersMatchHold(passengers, expectedCounts, itineraries, segments);
    return undefined;
  } catch (error) {
    return (error as { getResponse(): { status: number; code: string } }).getResponse();
  }
}

describe('assertPassengersMatchHold', () => {
  const adult = person('a1', 'ADULT');
  const infant = person('i1', 'INFANT', { associatedAdultId: 'a1' });

  it('acepta pasajeros que coinciden con el hold', () => {
    expect(check([adult, infant])).toBeUndefined();
  });

  it.each([
    ['cantidades distintas al hold', [adult], 'VALIDATION_FAILED'],
    ['passengerId duplicado', [adult, { ...infant, passengerId: 'a1' }], 'VALIDATION_FAILED'],
    ['infante sin adulto asociado', [adult, person('i1', 'INFANT')], 'VALIDATION_FAILED'],
    ['infante asociado a otro infante', [adult, person('i1', 'INFANT', { associatedAdultId: 'i1' })], 'VALIDATION_FAILED'],
    ['infante con asiento', [adult, { ...infant, assignedSeats: [{ segmentId: segments[0]!, seatNumber: '10A' }] }], 'INFANT_SEAT_NOT_ALLOWED'],
    ['adulto con associatedAdultId', [{ ...adult, associatedAdultId: 'x' }, infant], 'VALIDATION_FAILED'],
    ['maleta en itinerario ajeno', [{ ...adult, extraBaggage: [{ itineraryId: 'otro', quantity: 1 }] }, infant], 'VALIDATION_FAILED'],
    ['cantidad de maletas < 1', [{ ...adult, extraBaggage: [{ itineraryId: itineraries[0]!, quantity: 0 }] }, infant], 'VALIDATION_FAILED'],
    ['más de 3 maletas extra', [{ ...adult, extraBaggage: [{ itineraryId: itineraries[0]!, quantity: 4 }] }, infant], 'BAGGAGE_LIMIT_EXCEEDED'],
    ['asiento en segmento ajeno', [{ ...adult, assignedSeats: [{ segmentId: 'EA999-20261201', seatNumber: '1A' }] }, infant], 'VALIDATION_FAILED'],
  ] as [string, PassengerItem[], string][])('rechaza %s con 422 %s', (_label, passengers, code) => {
    expect(check(passengers)).toEqual({ status: 422, code, title: expect.any(String), type: 'about:blank', invalidParams: expect.any(Array) });
  });

  it('un adulto no puede llevar dos infantes', () => {
    const twoInfants = { adults: 1, youths: 0, children: 0, infants: 2 };
    expect(check([adult, infant, { ...infant, passengerId: 'i2' }], twoInfants)).toMatchObject({ status: 422 });
  });
});
