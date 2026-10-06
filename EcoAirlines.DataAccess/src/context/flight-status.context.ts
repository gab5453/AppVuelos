import { Injectable } from '@nestjs/common';
import type { FlightStatusOverride } from '../entities/flight-status/flight-status-override.entity.js';

/**
 * Contexto de datos de la **base de datos futura `flight-status`** (equivale a un DbContext). Dueño: dominio
 * flight-status. Guarda los ajustes operativos que registra un administrador; el resto del estado sale del GDS.
 */
@Injectable()
export class FlightStatusDataContext {
  /** Ajustes por `flightNumber|fecha`. */
  readonly overrides = new Map<string, FlightStatusOverride>();
}
