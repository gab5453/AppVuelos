/**
 * Check-in de una reserva por segmento y pasajero; el valor es el asiento (`null` para infantes).
 * Los pases de abordar se derivan de él. **Base de datos futura: `check-in`.**
 */
export type CheckInRecord = Record<string, Record<string, string | null>>;
