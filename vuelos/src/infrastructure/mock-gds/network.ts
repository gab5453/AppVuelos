import type { CabinClass } from '../../common/contract-types/common.types.js';

/**
 * Red simulada de la aerolínea: aviones, vuelos diarios y familias tarifarias.
 * Código de aerolínea ficticio (EA, "EcoAirlines"); ver HALL-10.
 */
export const AIRLINE = { code: 'EA', name: 'EcoAirlines' } as const;

export type AircraftType = 'Airbus A220-300' | 'Airbus A320neo' | 'Boeing 787-9';

export interface CabinLayout {
  cabinClass: CabinClass;
  firstRow: number;
  lastRow: number;
  /** Letras de asiento por fila; `-` marca un pasillo. */
  layout: string;
  exitRows?: number[];
  extraLegroomRows?: number[];
}

export const AIRCRAFT: Readonly<Record<AircraftType, CabinLayout[]>> = {
  'Airbus A220-300': [
    { cabinClass: 'BUSINESS', firstRow: 1, lastRow: 3, layout: 'AC-DF' },
    { cabinClass: 'ECONOMY', firstRow: 4, lastRow: 25, layout: 'AC-DEF', exitRows: [13], extraLegroomRows: [4, 13] },
  ],
  'Airbus A320neo': [
    { cabinClass: 'BUSINESS', firstRow: 1, lastRow: 3, layout: 'AC-DF' },
    { cabinClass: 'ECONOMY', firstRow: 4, lastRow: 30, layout: 'ABC-DEF', exitRows: [12, 13], extraLegroomRows: [4, 12, 13] },
  ],
  'Boeing 787-9': [
    { cabinClass: 'BUSINESS', firstRow: 1, lastRow: 7, layout: 'AC-DG-HK' },
    { cabinClass: 'ECONOMY', firstRow: 10, lastRow: 40, layout: 'ABC-DEF-GHJ', exitRows: [20, 30], extraLegroomRows: [10, 20, 30] },
  ],
};

export interface ScheduledFlight {
  flightNumber: string;
  origin: string;
  destination: string;
  /** Hora local de salida en el aeropuerto de origen (HH:MM). Todos los vuelos operan a diario. */
  departureLocal: string;
  aircraft: AircraftType;
}

const A220: AircraftType = 'Airbus A220-300';
const A320: AircraftType = 'Airbus A320neo';
const B789: AircraftType = 'Boeing 787-9';

export const SCHEDULE: readonly ScheduledFlight[] = (
  [
    ['EA200', 'UIO', 'GYE', '06:00', A220],
    ['EA202', 'UIO', 'GYE', '12:30', A220],
    ['EA204', 'UIO', 'GYE', '19:00', A220],
    ['EA201', 'GYE', 'UIO', '07:30', A220],
    ['EA203', 'GYE', 'UIO', '14:00', A220],
    ['EA205', 'GYE', 'UIO', '20:30', A220],
    ['EA210', 'UIO', 'CUE', '08:00', A220],
    ['EA211', 'CUE', 'UIO', '09:45', A220],
    ['EA212', 'GYE', 'CUE', '16:00', A220],
    ['EA213', 'CUE', 'GYE', '17:45', A220],
    ['EA300', 'UIO', 'BOG', '07:00', A320],
    ['EA302', 'UIO', 'BOG', '15:30', A320],
    ['EA301', 'BOG', 'UIO', '10:30', A320],
    ['EA303', 'BOG', 'UIO', '19:00', A320],
    ['EA310', 'GYE', 'BOG', '09:00', A320],
    ['EA311', 'BOG', 'GYE', '13:30', A320],
    ['EA320', 'UIO', 'LIM', '08:30', A320],
    ['EA321', 'LIM', 'UIO', '13:00', A320],
    ['EA322', 'GYE', 'LIM', '07:15', A320],
    ['EA323', 'LIM', 'GYE', '11:30', A320],
    ['EA330', 'BOG', 'MDE', '08:00', A220],
    ['EA332', 'BOG', 'MDE', '17:00', A220],
    ['EA331', 'MDE', 'BOG', '10:00', A220],
    ['EA333', 'MDE', 'BOG', '19:30', A220],
    ['EA400', 'BOG', 'MIA', '09:30', A320],
    ['EA401', 'MIA', 'BOG', '16:00', A320],
    ['EA402', 'UIO', 'MIA', '23:45', A320],
    ['EA403', 'MIA', 'UIO', '15:00', A320],
    ['EA410', 'BOG', 'MEX', '08:15', A320],
    ['EA411', 'MEX', 'BOG', '15:30', A320],
    ['EA420', 'LIM', 'SCL', '06:45', A320],
    ['EA421', 'SCL', 'LIM', '13:00', A320],
    ['EA500', 'BOG', 'MAD', '19:00', B789],
    ['EA501', 'MAD', 'BOG', '12:00', B789],
    ['EA502', 'UIO', 'MAD', '17:30', B789],
    ['EA503', 'MAD', 'UIO', '11:30', B789],
  ] as const
).map(([flightNumber, origin, destination, departureLocal, aircraft]) => ({
  flightNumber,
  origin,
  destination,
  departureLocal,
  aircraft,
}));

/** Terminales conocidas; el resto de aeropuertos opera con terminal única (`null`). */
export const TERMINALS: Readonly<Record<string, string>> = { BOG: '1', MAD: '4S', MIA: 'N', MEX: '1' };

export interface FareBrandDefinition {
  fareBrand: string;
  cabinClass: CabinClass;
  /** Multiplicador sobre la tarifa base del itinerario. */
  multiplier: number;
  isRefundable: boolean;
  isChangeable: boolean;
  /** Cargo por cambio de fecha por pasajero (USD). */
  changeFeeUsd: number;
  personalItemIncluded: boolean;
  carryOnIncluded: number;
  checkedBaggageIncluded: number;
}

/** Familias tarifarias con identidad ecológica de la marca: de la semilla al dosel del bosque. */
export const FARE_BRANDS: readonly FareBrandDefinition[] = [
  { fareBrand: 'SEMILLA', cabinClass: 'ECONOMY', multiplier: 1, isRefundable: false, isChangeable: false, changeFeeUsd: 0, personalItemIncluded: true, carryOnIncluded: 0, checkedBaggageIncluded: 0 },
  { fareBrand: 'BROTE', cabinClass: 'ECONOMY', multiplier: 1.35, isRefundable: false, isChangeable: true, changeFeeUsd: 50, personalItemIncluded: true, carryOnIncluded: 1, checkedBaggageIncluded: 1 },
  { fareBrand: 'BOSQUE', cabinClass: 'ECONOMY', multiplier: 1.8, isRefundable: true, isChangeable: true, changeFeeUsd: 0, personalItemIncluded: true, carryOnIncluded: 1, checkedBaggageIncluded: 2 },
  { fareBrand: 'DOSEL', cabinClass: 'BUSINESS', multiplier: 3.2, isRefundable: true, isChangeable: true, changeFeeUsd: 0, personalItemIncluded: true, carryOnIncluded: 2, checkedBaggageIncluded: 2 },
];
