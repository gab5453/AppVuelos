import type { ItineraryOption } from '../api/types';
import { cityOf } from '../data/airports';
import { formatDuration, localDate, localTime } from '../lib/format';
import { Co2Badge } from './Co2Badge';

/** Ruta de un itinerario: horas locales, escalas, duración y emisiones estimadas. */
export function ItinerarySummary({
  itinerary,
  cabinClass,
  label,
}: {
  itinerary: ItineraryOption;
  cabinClass?: string;
  label?: string;
}) {
  const first = itinerary.segments[0]!;
  const last = itinerary.segments.at(-1)!;
  const stops = itinerary.stopsCount === 0 ? 'Directo' : `${itinerary.stopsCount} escala${itinerary.stopsCount > 1 ? 's' : ''}`;

  return (
    <div className="itinerary">
      {label && <p className="itinerary-label">{label} · {localDate(first.departure.at)}</p>}
      <div className="route">
        <div className="route-point">
          <strong className="route-time">{localTime(first.departure.at)}</strong>
          <span className="route-code">{first.departure.iataCode}</span>
          <span className="muted small">{cityOf(first.departure.iataCode)}</span>
        </div>
        <div className="route-line" aria-hidden="true">
          <span className="muted small">{formatDuration(itinerary.totalDurationMinutes)}</span>
          <span className="route-track" />
          <span className={`small ${itinerary.stopsCount === 0 ? 'text-green' : 'muted'}`}>{stops}</span>
        </div>
        <div className="route-point route-point-end">
          <strong className="route-time">{localTime(last.arrival.at)}</strong>
          <span className="route-code">{last.arrival.iataCode}</span>
          <span className="muted small">{cityOf(last.arrival.iataCode)}</span>
        </div>
      </div>
      <p className="visually-hidden">
        Sale de {cityOf(first.departure.iataCode)} a las {localTime(first.departure.at)} y llega a {cityOf(last.arrival.iataCode)} a las{' '}
        {localTime(last.arrival.at)}. {stops}.
      </p>
      <div className="itinerary-meta">
        <span className="muted small">
          {itinerary.segments.map((segment) => segment.flightNumber).join(' · ')}
          {first.aircraft ? ` · ${first.aircraft}` : ''}
        </span>
        {itinerary.segments.length > 1 && (
          <span className="muted small">
            Escala en {cityOf(itinerary.segments[0]!.arrival.iataCode)} ({formatDuration(itinerary.segments[0]!.layoverMinutes)})
          </span>
        )}
        <Co2Badge segments={itinerary.segments} cabinClass={cabinClass} />
      </div>
    </div>
  );
}
