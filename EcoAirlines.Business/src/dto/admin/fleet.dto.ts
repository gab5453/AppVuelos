import { IsIn, IsOptional, Matches } from 'class-validator';
import type { AircraftType } from '@ecoairlines/data-access/seed/network.js';
import { IATA_CODE_PATTERN } from '../../validation/patterns.js';
import { AIRCRAFT_TYPES } from './scheduled-route.dto.js';

/*
 * Flota — **extensión fuera del contrato** (CRUD del panel de administración). Los tipos de avión son datos maestros (mapa
 * de asientos, alcance, tiempo en tierra): se consultan, no se editan.
 */

/** Cuerpo de `POST /admin/aircraft`: la matrícula se asigna sola (la siguiente libre del tipo, p. ej. HC-N57). */
export class AircraftRequestDto {
  @IsIn(AIRCRAFT_TYPES)
  aircraftType!: AircraftType;

  /** Aeropuerto donde el avión empieza y termina su semana. */
  @Matches(IATA_CODE_PATTERN)
  base!: string;
}

/** Cuerpo de `PUT /admin/aircraft/{registration}`: solo cambia la base (un avión no cambia de tipo). */
export class UpdateAircraftRequestDto {
  @Matches(IATA_CODE_PATTERN)
  base!: string;
}

/** Filtros de `GET /admin/aircraft`. */
export class AircraftQueryDto {
  @IsOptional()
  @Matches(IATA_CODE_PATTERN)
  base?: string;

  @IsOptional()
  @IsIn(AIRCRAFT_TYPES)
  aircraftType?: AircraftType;
}

export interface AircraftDto {
  registration: string;
  aircraftType: AircraftType;
  base: string;
  /** `IN_SERVICE` si opera alguna ruta; `AVAILABLE` si está libre (se puede asignar, cambiar de base o retirar). */
  status: 'IN_SERVICE' | 'AVAILABLE';
  /** Rutas programadas que opera (`routeId`). */
  routes: string[];
  totalSeats: number;
  source: 'NETWORK' | 'ADMIN';
  createdAt: string;
  updatedAt: string;
}

export interface AircraftTypeDto {
  aircraftType: AircraftType;
  /** Prefijo de sus matrículas (HC-J, HC-N, HC-W). */
  registrationPrefix: string;
  seats: { cabinClass: string; seats: number }[];
  totalSeats: number;
  /** Distancia máxima de las rutas que puede operar (`null` = sin límite en la red). */
  maxRouteKm: number | null;
  turnaroundMinutes: number;
  /** Aviones de este tipo en la flota. */
  inFleet: number;
}
