import type { CabinClass } from '../common/contract/common.types.js';

/**
 * Red simulada de la aerolínea: aviones y familias tarifarias. El horario de vuelos se genera en `timetable.ts`.
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
