import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsOptional, Matches } from 'class-validator';
import type { ScheduledRouteSource } from '@ecoairlines/data-access/entities/admin/scheduled-route.entity.js';
import type { AircraftType } from '@ecoairlines/data-access/seed/network.js';
import { IATA_CODE_PATTERN } from '../../validation/patterns.js';

/*
 * Rutas programadas — **extensión fuera del contrato** (CRUD del panel de administración). Una ruta es una línea de ida
 * y vuelta: la ida sale de `origin` los días indicados y la vuelta regresa con el mismo avión.
 */

export const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export const AIRCRAFT_TYPES: readonly AircraftType[] = ['Airbus A220-300', 'Airbus A320neo', 'Boeing 787-9'];

/** Matrícula de un avión: HC- y de 2 a 6 letras o dígitos (p. ej. HC-J01). */
export const REGISTRATION_PATTERN = /^HC-[A-Z0-9]{2,6}$/;

/** Hora local `HH:MM` (00:00–23:59). */
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Filtro de `GET /admin/routes`: rutas que salen de o llegan a un aeropuerto. */
export class AdminRoutesQueryDto {
  @IsOptional()
  @Matches(IATA_CODE_PATTERN)
  airport?: string;
}

/** Cuerpo de `POST /admin/routes` y `PUT /admin/routes/{routeId}`. */
export class ScheduledRouteRequestDto {
  @Matches(IATA_CODE_PATTERN)
  origin!: string;

  @Matches(IATA_CODE_PATTERN)
  destination!: string;

  /** Hora local de salida de la ida, en el origen. */
  @Matches(LOCAL_TIME_PATTERN, { message: 'outboundDepartureLocal must be HH:MM (00:00-23:59)' })
  outboundDepartureLocal!: string;

  /** Hora local de salida de la vuelta, en el destino. */
  @Matches(LOCAL_TIME_PATTERN, { message: 'inboundDepartureLocal must be HH:MM (00:00-23:59)' })
  inboundDepartureLocal!: string;

  /** Días en que sale la ida. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsIn(WEEKDAY_CODES, { each: true })
  weekdays!: WeekdayCode[];

  /** Opcional: por defecto el que corresponde a la distancia (A220 < 1 500 km, A320neo < 4 500 km, 787-9). */
  @IsOptional()
  @IsIn(AIRCRAFT_TYPES)
  aircraftType?: AircraftType;
  /**
   * Opcional: matrículas de aviones de la flota que operarán la ruta (mismo tipo y con base en el origen). Si se omite, se
   * asignan solos: al crear, aviones nuevos; al editar, los que ya tenía más los que falten.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @Matches(REGISTRATION_PATTERN, { each: true, message: 'each value in aircraft must be a registration like HC-J01' })
  aircraft?: string[];
}

export interface RouteLegDto {
  flightNumber: string;
  origin: string;
  destination: string;
  /** Hora local de salida (`HH:MM`). */
  departureLocal: string;
  /** Hora local de llegada (`HH:MM`). */
  arrivalLocal: string;
  /** Días después de la salida en que llega (0 = mismo día). */
  arrivalDayOffset: number;
}

/** Ruta programada tal como la ve el administrador. */
export interface ScheduledRouteDto {
  routeId: string;
  origin: string;
  destination: string;
  outbound: RouteLegDto;
  inbound: RouteLegDto;
  weekdays: WeekdayCode[];
  aircraftType: AircraftType;
  /** Aviones asignados por el horario (dedicados a esta ruta). */
  aircraft: string[];
  distanceKm: number;
  durationMinutes: number;
  /** Cupos tomados por clientes de hoy en adelante: con pasajeros, la ruta no se puede editar ni dar de baja. */
  customerSeats: number;
  source: ScheduledRouteSource;
  createdAt: string;
  updatedAt: string;
}
