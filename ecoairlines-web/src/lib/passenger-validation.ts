import type { PassengerType } from '../api/types';

/**
 * Las mismas reglas que aplica la API al crear la reserva (422 VALIDATION_FAILED), para avisar antes de pagar:
 * rangos de edad por tipo, documento válido y sin repetir dentro de la reserva.
 */
export const AGE_RANGES: Record<PassengerType, { min: number; max?: number; hint: string }> = {
  ADULT: { min: 15, hint: '15 años o más' },
  YOUTH: { min: 12, max: 14, hint: '12 a 14 años' },
  CHILD: { min: 2, max: 11, hint: '2 a 11 años' },
  INFANT: { min: 0, max: 1, hint: 'menor de 2 años durante todo el viaje' },
};

export function ageOn(birthDate: string, date: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

const shiftYears = (date: string, years: number) => `${String(Number(date.slice(0, 4)) + years).padStart(4, '0')}${date.slice(4)}`;
const nextDay = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Rango de fechas de nacimiento válidas para el tipo de pasajero (para los atributos min/max del calendario). */
export function birthDateBounds(type: PassengerType, firstDeparture: string, lastDeparture: string): { min?: string; max: string } {
  const range = AGE_RANGES[type];
  const max = shiftYears(firstDeparture, -range.min);
  if (range.max === undefined) return { max };
  const reference = type === 'INFANT' ? lastDeparture : firstDeparture;
  return { min: nextDay(shiftYears(reference, -(range.max + 1))), max };
}

export const normalizeDocument = (value: string) => value.replace(/[\s.-]/g, '').toUpperCase();

/** Cédula ecuatoriana: provincia, tercer dígito y dígito verificador (módulo 10). */
export function isValidEcuadorianId(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30) || Number(value[2]) >= 6) return false;
  const sum = value
    .slice(0, 9)
    .split('')
    .reduce((acc, digit, index) => {
      const product = Number(digit) * (index % 2 === 0 ? 2 : 1);
      return acc + (product > 9 ? product - 9 : product);
    }, 0);
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}

export interface PassengerIdentity {
  passengerType: PassengerType;
  documentType: 'PASSPORT' | 'NATIONAL_ID';
  documentNumber: string;
  nationality: string;
  documentExpiryDate: string;
  birthDate: string;
}

/** Errores por pasajero (índice → campo → mensaje). Solo revisa los campos ya completados. */
export function passengerIssues(
  passengers: PassengerIdentity[],
  travel: { firstDeparture: string; lastDeparture: string },
): Record<number, Partial<Record<'documentNumber' | 'birthDate' | 'documentExpiryDate', string>>> {
  const issues: Record<number, Partial<Record<'documentNumber' | 'birthDate' | 'documentExpiryDate', string>>> = {};
  const seen = new Map<string, number>();
  passengers.forEach((passenger, index) => {
    const mine: (typeof issues)[number] = {};
    const document = normalizeDocument(passenger.documentNumber);
    if (document) {
      const key = `${passenger.nationality.trim().toUpperCase()}:${document}`;
      if (!/^[A-Z0-9]{5,20}$/.test(document)) mine.documentNumber = 'Debe tener entre 5 y 20 letras o dígitos.';
      else if (passenger.documentType === 'NATIONAL_ID' && passenger.nationality.trim().toUpperCase() === 'EC' && !isValidEcuadorianId(document)) {
        mine.documentNumber = 'La cédula ecuatoriana no es válida.';
      } else if (seen.has(key)) mine.documentNumber = `Este documento ya lo tiene el pasajero ${seen.get(key)! + 1}.`;
      if (!seen.has(key)) seen.set(key, index);
    }
    if (passenger.documentExpiryDate && passenger.documentExpiryDate < travel.lastDeparture) {
      mine.documentExpiryDate = 'El documento vence antes del viaje.';
    }
    if (passenger.birthDate) {
      const range = AGE_RANGES[passenger.passengerType];
      const age = ageOn(passenger.birthDate, travel.firstDeparture);
      const ageAtEnd = ageOn(passenger.birthDate, travel.lastDeparture);
      if (passenger.birthDate > travel.firstDeparture) mine.birthDate = 'La fecha de nacimiento no puede ser posterior al viaje.';
      else if (age < range.min || (range.max !== undefined && (passenger.passengerType === 'INFANT' ? ageAtEnd : age) > range.max)) {
        mine.birthDate = `Tendrá ${age} años el día del vuelo; este pasajero debe tener ${range.hint}.`;
      }
    }
    if (Object.keys(mine).length) issues[index] = mine;
  });
  return issues;
}
