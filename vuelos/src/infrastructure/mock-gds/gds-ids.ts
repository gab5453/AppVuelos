/**
 * Identificadores deterministas y reconstruibles del GDS simulado:
 * - segmentId:   `EA300-20261201` (vuelo + fecha local de salida)
 * - itineraryId: segmentIds unidos por `.` (p. ej. `EA300-20261201.EA400-20261201`)
 * - offerId:     itineraryIds unidos por `~` (ida y vuelta, multidestino)
 * Al ser reconstruibles, una oferta sigue siendo válida mientras sus vuelos existan y tengan cupo,
 * sin depender de una caché en memoria.
 */
import { isCalendarDate } from '../../common/validation/calendar-date.js';

const SEGMENT_ID = /^(EA\d{3})-(\d{4})(\d{2})(\d{2})$/;

export function buildSegmentId(flightNumber: string, localDate: string): string {
  return `${flightNumber}-${localDate.replaceAll('-', '')}`;
}

export function parseSegmentId(segmentId: string): { flightNumber: string; localDate: string } | undefined {
  const match = SEGMENT_ID.exec(segmentId);
  if (!match) return undefined;
  const [, flightNumber, year, month, day] = match;
  const localDate = `${year}-${month}-${day}`;
  return isCalendarDate(localDate) ? { flightNumber: flightNumber!, localDate } : undefined;
}

export const buildItineraryId = (segmentIds: string[]): string => segmentIds.join('.');
export const parseItineraryId = (itineraryId: string): string[] => itineraryId.split('.');
export const buildOfferId = (itineraryIds: string[]): string => itineraryIds.join('~');
export const parseOfferId = (offerId: string): string[] => offerId.split('~');

/** Instante UTC (ms) de una fecha y hora locales con un desfase fijo. */
export function localToUtcMs(localDate: string, localTime: string, utcOffsetMinutes: number): number {
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  const [hours, minutes] = localTime.split(':').map(Number) as [number, number];
  return Date.UTC(year, month - 1, day, hours, minutes) - utcOffsetMinutes * 60_000;
}

/** ISO 8601 en hora local con desfase, p. ej. `2026-12-01T07:00:00-05:00`. */
export function formatLocalIso(utcMs: number, utcOffsetMinutes: number): string {
  const local = new Date(utcMs + utcOffsetMinutes * 60_000).toISOString().slice(0, 19);
  const sign = utcOffsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(utcOffsetMinutes);
  const offset = `${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
  return `${local}${sign}${offset}`;
}

export function localDateOf(utcMs: number, utcOffsetMinutes: number): string {
  return new Date(utcMs + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function addDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
