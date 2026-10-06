import type { PassengerItem, PassengerType } from '@ecoairlines/data-access/common/contract/common.types.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';

/**
 * Rangos de edad de EcoAirlines (los mismos que muestra el buscador). El contrato no los define (ver HALLAZGOS.md):
 * - Adulto: 15 años o más.
 * - Joven: 12 a 14 años.
 * - Niño: 2 a 11 años.
 * - Infante: menor de 2 años durante todo el viaje (viaja en brazos).
 * La edad se mide el día del primer vuelo; el infante, además, debe seguir teniendo menos de 2 años el día del último.
 */
export const AGE_RANGES: Record<PassengerType, { min: number; max?: number; label: string }> = {
  ADULT: { min: 15, label: 'Adulto (15 años o más)' },
  YOUTH: { min: 12, max: 14, label: 'Joven (12 a 14 años)' },
  CHILD: { min: 2, max: 11, label: 'Niño (2 a 11 años)' },
  INFANT: { min: 0, max: 1, label: 'Infante (menor de 2 años)' },
};

/** Edad cumplida en años en una fecha (YYYY-MM-DD). */
export function ageOn(birthDate: string, date: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Número de documento sin espacios, guiones ni puntos, en mayúsculas. */
export function normalizeDocument(documentNumber: string): string {
  return documentNumber.replace(/[\s.-]/g, '').toUpperCase();
}

/**
 * Cédula ecuatoriana: 10 dígitos, provincia 01–24 (o 30 para ecuatorianos en el exterior), tercer dígito menor a 6 y dígito
 * verificador por módulo 10 (coeficientes 2, 1, 2, 1…; si el producto pasa de 9 se le resta 9).
 */
export function isValidEcuadorianId(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30)) return false;
  if (Number(value[2]) >= 6) return false;
  const sum = value.slice(0, 9).split('').reduce((acc, digit, index) => {
    const product = Number(digit) * (index % 2 === 0 ? 2 : 1);
    return acc + (product > 9 ? product - 9 : product);
  }, 0);
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}

function unprocessable(title: string, name: string, reason: string): ProblemDetailsException {
  return new ProblemDetailsException({ status: 422, code: 'VALIDATION_FAILED', title, invalidParams: [{ name, reason }] });
}

/** Clave que identifica a una persona por su documento: país + número normalizado. */
export const identityKey = (passenger: Pick<PassengerItem, 'nationality' | 'documentNumber'>): string =>
  `${passenger.nationality.trim().toUpperCase()}:${normalizeDocument(passenger.documentNumber)}`;

/**
 * Reglas de identidad de los pasajeros (422 VALIDATION_FAILED):
 * - documento con formato válido; la cédula ecuatoriana se valida con su dígito verificador;
 * - el documento no se repite dentro de la reserva (los nombres sí pueden repetirse: gemelos);
 * - el documento no vence antes del último vuelo;
 * - la fecha de nacimiento no es posterior al viaje y la edad corresponde al tipo de pasajero.
 */
export function assertPassengerIdentities(passengers: PassengerItem[], travel: { firstDeparture: string; lastDeparture: string }): void {
  const seen = new Map<string, number>();

  passengers.forEach((passenger, index) => {
    const path = `passengers[${index}]`;
    const document = normalizeDocument(passenger.documentNumber);

    if (!/^[A-Z0-9]{5,20}$/.test(document)) {
      throw unprocessable('El número de documento debe tener entre 5 y 20 letras o dígitos.', `${path}.documentNumber`, 'invalid format');
    }
    if (passenger.documentType === 'NATIONAL_ID' && passenger.nationality.trim().toUpperCase() === 'EC' && !isValidEcuadorianId(document)) {
      throw unprocessable('La cédula ecuatoriana no es válida.', `${path}.documentNumber`, 'invalid Ecuadorian national id');
    }
    const key = identityKey(passenger);
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw unprocessable(
        `El documento ${document} está repetido: lo tienen los pasajeros ${previous + 1} y ${index + 1}.`,
        `${path}.documentNumber`,
        `duplicated document (passengers[${previous}])`,
      );
    }
    seen.set(key, index);

    if (passenger.documentExpiryDate && passenger.documentExpiryDate < travel.lastDeparture) {
      throw unprocessable('El documento vence antes del viaje.', `${path}.documentExpiryDate`, `must be on or after ${travel.lastDeparture}`);
    }

    if (passenger.birthDate > travel.firstDeparture) {
      throw unprocessable('La fecha de nacimiento no puede ser posterior al viaje.', `${path}.birthDate`, 'birth date after departure');
    }
    const range = AGE_RANGES[passenger.passengerType];
    const age = ageOn(passenger.birthDate, travel.firstDeparture);
    const ageAtEnd = ageOn(passenger.birthDate, travel.lastDeparture);
    if (age < range.min || (range.max !== undefined && (passenger.passengerType === 'INFANT' ? ageAtEnd : age) > range.max)) {
      throw unprocessable(
        `La edad del pasajero ${index + 1} (${age} años el día del vuelo) no corresponde a ${range.label}.`,
        `${path}.birthDate`,
        `age ${age} not allowed for ${passenger.passengerType}`,
      );
    }
  });
}

/** Fechas locales del primer y último vuelo a partir de los segmentId (`EA104-20261201`). */
export function travelDates(segmentIds: string[]): { firstDeparture: string; lastDeparture: string } {
  const dates = segmentIds
    .map((segmentId) => /-(\d{4})(\d{2})(\d{2})$/.exec(segmentId))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(([, y, m, d]) => `${y}-${m}-${d}`)
    .sort();
  return { firstDeparture: dates[0] ?? '', lastDeparture: dates.at(-1) ?? '' };
}
