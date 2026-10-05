import type { FlightSegment } from '../api/types';
import { airportByCode } from '../data/airports';

/**
 * Estimación ILUSTRATIVA de emisiones (contenido solo del frontend; la API no tiene este dato).
 * kg CO₂ por pasajero-km según cabina, con un factor de ruta (desvíos y ascenso) de 1.08.
 */
const KG_PER_PASSENGER_KM: Record<string, number> = {
  ECONOMY: 0.09,
  PREMIUM_ECONOMY: 0.14,
  BUSINESS: 0.24,
  FIRST: 0.32,
};
/** Absorción anual aproximada de un árbol, para traducir kg a algo tangible. */
const KG_PER_TREE_YEAR = 21;

function distanceKm(from: string, to: string): number {
  const a = airportByCode(from);
  const b = airportByCode(to);
  if (!a || !b) return 0;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function estimateCo2Kg(segments: FlightSegment[], cabinClass = 'ECONOMY'): number {
  const km = segments.reduce((total, segment) => total + distanceKm(segment.departure.iataCode, segment.arrival.iataCode), 0);
  return Math.round(km * 1.08 * (KG_PER_PASSENGER_KM[cabinClass] ?? KG_PER_PASSENGER_KM.ECONOMY!));
}

export function treesEquivalent(kg: number): number {
  return Math.max(1, Math.round(kg / KG_PER_TREE_YEAR));
}
