import type { PassengerItem } from '@ecoairlines/data-access/common/contract/common.types.js';
import { ageOn, assertPassengerIdentities, isValidEcuadorianId, travelDates } from './passenger-identity-rules.js';

const travel = { firstDeparture: '2026-12-01', lastDeparture: '2026-12-10' };

function person(passengerType: PassengerItem['passengerType'], birthDate: string, extra: Partial<PassengerItem> = {}): PassengerItem {
  return {
    passengerId: `${passengerType}-${birthDate}`,
    passengerType,
    firstName: 'Gabriel',
    lastName: 'Aveiga',
    documentType: 'PASSPORT',
    documentNumber: `P${birthDate.replace(/-/g, '')}`,
    nationality: 'EC',
    birthDate,
    gender: 'M',
    contact: { email: 'a@b.c', phone: '1' },
    ...extra,
  };
}

function check(passengers: PassengerItem[]) {
  try {
    assertPassengerIdentities(passengers, travel);
    return undefined;
  } catch (error) {
    return (error as { getResponse(): { status: number; code: string; invalidParams: { name: string }[] } }).getResponse();
  }
}

describe('assertPassengerIdentities', () => {
  it('calcula la edad cumplida', () => {
    expect(ageOn('2011-12-02', '2026-12-01')).toBe(14);
    expect(ageOn('2011-12-01', '2026-12-01')).toBe(15);
  });

  it('valida la cédula ecuatoriana con su dígito verificador', () => {
    expect(isValidEcuadorianId('1710034065')).toBe(true);
    expect(isValidEcuadorianId('1710034066')).toBe(false);
    expect(isValidEcuadorianId('9910034065')).toBe(false);
    expect(isValidEcuadorianId('171003406')).toBe(false);
  });

  it('acepta un grupo con edades correctas y gemelos con el mismo nombre pero distinto documento', () => {
    expect(
      check([
        person('ADULT', '1990-01-01'),
        person('ADULT', '1990-01-02', { documentType: 'NATIONAL_ID', documentNumber: '171003406-5' }),
        person('YOUTH', '2012-06-01'),
        person('CHILD', '2018-06-01'),
        person('INFANT', '2025-12-11'),
      ]),
    ).toBeUndefined();
  });

  it.each([
    ['adulto nacido este año', [person('ADULT', '2026-01-01')], 'passengers[0].birthDate'],
    ['adulto de 14 años', [person('ADULT', '2011-12-02')], 'passengers[0].birthDate'],
    ['joven de 15 años', [person('YOUTH', '2011-12-01')], 'passengers[0].birthDate'],
    ['niño de 12 años', [person('CHILD', '2014-01-01')], 'passengers[0].birthDate'],
    ['infante que cumple 2 durante el viaje', [person('INFANT', '2024-12-05')], 'passengers[0].birthDate'],
    ['nacimiento posterior al viaje', [person('INFANT', '2026-12-05')], 'passengers[0].birthDate'],
    ['cédula ecuatoriana inválida', [person('ADULT', '1990-01-01', { documentType: 'NATIONAL_ID', documentNumber: '1710034066' })], 'passengers[0].documentNumber'],
    ['documento muy corto', [person('ADULT', '1990-01-01', { documentNumber: '12' })], 'passengers[0].documentNumber'],
    ['documento vencido antes del regreso', [person('ADULT', '1990-01-01', { documentExpiryDate: '2026-12-05' })], 'passengers[0].documentExpiryDate'],
    [
      'documento repetido (aunque cambie el formato)',
      [person('ADULT', '1990-01-01', { documentNumber: 'AB-123 456' }), person('ADULT', '1991-01-01', { documentNumber: 'ab123456' })],
      'passengers[1].documentNumber',
    ],
  ] as [string, PassengerItem[], string][])('rechaza %s con 422', (_label, passengers, name) => {
    expect(check(passengers)).toMatchObject({ status: 422, code: 'VALIDATION_FAILED', invalidParams: [{ name }] });
  });

  it('obtiene las fechas del primer y último vuelo de los segmentos', () => {
    expect(travelDates(['EA207-20261210', 'EA104-20261201'])).toEqual({ firstDeparture: '2026-12-01', lastDeparture: '2026-12-10' });
  });
});
