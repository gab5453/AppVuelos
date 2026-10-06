import type { PassengerBreakdown, SearchRequest } from '../api/types';

export type TripType = 'ONE_WAY' | 'ROUND_TRIP' | 'MULTI_CITY';

/**
 * La búsqueda viaja en la URL (`/vuelos?tramos=UIO-BOG-2026-12-01,...&adultos=1`) para que los
 * resultados se puedan recargar y compartir. Solo contiene datos públicos de la búsqueda.
 */
export function toQuery(request: SearchRequest, tripType: TripType): string {
  const params = new URLSearchParams({
    tipo: tripType,
    tramos: request.itineraries.map((leg) => `${leg.origin}-${leg.destination}-${leg.departureDate}`).join(','),
    adultos: String(request.passengers.adults ?? 1),
    jovenes: String(request.passengers.youths ?? 0),
    ninos: String(request.passengers.children ?? 0),
    infantes: String(request.passengers.infants ?? 0),
  });
  return params.toString();
}

export function fromQuery(params: URLSearchParams): { request: SearchRequest; tripType: TripType } | undefined {
  const legs = (params.get('tramos') ?? '')
    .split(',')
    .map((leg) => /^([A-Z]{3})-([A-Z]{3})-(\d{4}-\d{2}-\d{2})$/.exec(leg))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(([, origin, destination, departureDate]) => ({ origin: origin!, destination: destination!, departureDate: departureDate! }));
  if (legs.length === 0 || legs.length > 6) return undefined;

  const count = (name: string, fallback: number, min: number) => {
    const value = Number(params.get(name) ?? fallback);
    return Number.isInteger(value) && value >= min && value <= 9 ? value : fallback;
  };
  const passengers: PassengerBreakdown = {
    adults: count('adultos', 1, 1),
    youths: count('jovenes', 0, 0),
    children: count('ninos', 0, 0),
    infants: count('infantes', 0, 0),
  };
  const tripType = (['ONE_WAY', 'ROUND_TRIP', 'MULTI_CITY'] as const).find((type) => type === params.get('tipo')) ?? 'ONE_WAY';
  return { request: { itineraries: legs, passengers }, tripType };
}
